(function (GC) {
  // Plano de governo (pauta do Paulo Fiuza, item 3): eixos editáveis e o relatório do plano em PDF.
  //   - Eixos: cada prefeitura troca nome, objetivo, ícone e as pastas de cada eixo, cria eixo novo (até 6) ou
  //     tira um eixo. Uma pasta fica em um eixo só (marcar num tira do outro). Guardado por cidade
  //     (gc.eixos.<cidade>); carrega antes de js/tela-metas.js, que só põe os eixos de fábrica quando não há os salvos.
  //   - PDF do plano: capa com o placar, um bloco por eixo (feito × esperado) e a tabela dos compromissos.
  const ic = (n) => `<i class="ti ti-${n}" aria-hidden="true"></i>`;
  const esc = (t) => (GC.escaparHtml ? GC.escaparHtml(t) : String(t));
  const chave = () => `gc.eixos.${GC.cidade ? GC.cidade.id : 'media'}`;
  const ICONES = { 'heart-handshake': 'Cuidado', school: 'Escola', 'shield-check': 'Segurança', 'building-community': 'Cidade', leaf: 'Meio ambiente', briefcase: 'Trabalho', coins: 'Finanças', bus: 'Transporte', trees: 'Parques', 'home-heart': 'Moradia', 'device-laptop': 'Tecnologia', scale: 'Justiça' };
  const FABRICA = [
    { id: 'pessoas', nome: 'Cuidar das pessoas', objetivo: 'Atendimento de saúde mais rápido e proteção a quem mais precisa.', icone: 'heart-handshake', areas: ['saude', 'assistencia'] },
    { id: 'educacao', nome: 'Educação que transforma', objetivo: 'Vaga, matrícula fácil e escola em condições.', icone: 'school', areas: ['educacao'] },
    { id: 'segura', nome: 'Cidade segura e preparada', objetivo: 'Menos crimes e resposta rápida a chuva e risco.', icone: 'shield-check', areas: ['seguranca', 'defesa_civil'] },
    { id: 'funciona', nome: 'Cidade que funciona', objetivo: 'Rua boa, trânsito que anda e cidade limpa.', icone: 'building-community', areas: ['infraestrutura', 'mobilidade', 'limpeza'] },
  ];
  try {
    const salvos = JSON.parse(localStorage.getItem(chave()));
    if (Array.isArray(salvos) && salvos.length) GC.EIXOS_GOVERNO = salvos;
  } catch (e) { /* sem armazenamento: eixos de fábrica */ }

  const areas = () => (GC.data && GC.data.areas) || [];
  const nomeArea = (id) => (areas().find((a) => a.id === id) || { nome: id }).nome;
  // Troca o conteúdo do array (as telas guardam a referência de GC.EIXOS_GOVERNO).
  function substituir(lista) {
    if (!Array.isArray(GC.EIXOS_GOVERNO)) GC.EIXOS_GOVERNO = [];
    GC.EIXOS_GOVERNO.splice(0, GC.EIXOS_GOVERNO.length, ...lista);
  }
  function validar(lista) {
    const erros = [];
    if (!lista.length) erros.push('O plano precisa de pelo menos um eixo.');
    if (lista.length > 6) erros.push('Use no máximo 6 eixos: mais que isso deixa de ser estratégia.');
    lista.forEach((e, i) => { if (!String(e.nome || '').trim()) erros.push(`O eixo ${i + 1} está sem nome.`); });
    const nomes = lista.map((e) => String(e.nome || '').trim().toLowerCase());
    if (new Set(nomes).size !== nomes.length) erros.push('Dois eixos com o mesmo nome.');
    return erros;
  }

  // ---------- editor ----------
  let dlg = null;
  function abrirEditor({ aoSalvar } = {}) {
    let rascunho = JSON.parse(JSON.stringify(GC.EIXOS_GOVERNO || FABRICA));
    let erros = [];
    if (!dlg) {
      dlg = document.createElement('dialog');
      dlg.className = 'mv-dialogo pe-dlg';
      document.body.appendChild(dlg);
    }
    const semEixo = () => areas().filter((a) => !rascunho.some((e) => e.areas.includes(a.id)));
    function render() {
      dlg.innerHTML = `<form class="mv-form" novalidate>
        <header class="mv-cab"><div><p class="mv-rotulo">Plano de governo</p><h2>${ic('hierarchy-2')} Eixos do plano</h2></div>
          <button type="button" class="gaveta-x" data-pe="fechar" aria-label="Fechar">${ic('x')}</button></header>
        <div class="oc-dlg-corpo">
          <p class="mv-dica">Os eixos são a estratégia da gestão. Cada um junta pastas; os compromissos da pasta entram no eixo dela.</p>
          ${erros.length ? `<p class="pe-erros" role="alert">${ic('alert-triangle')} ${erros.map(esc).join(' ')}</p>` : ''}
          ${rascunho.map((e, i) => `<fieldset class="pe-eixo" data-pe-i="${i}">
            <legend>Eixo ${i + 1}</legend>
            <div class="pe-linha"><label class="pe-campo">Nome <input name="nome" value="${esc(e.nome)}" maxlength="40" required></label>
              <label class="pe-campo pe-ic">Ícone <select name="icone">${Object.entries(ICONES).map(([x, nome]) => `<option value="${x}"${e.icone === x ? ' selected' : ''}>${nome}</option>`).join('')}</select></label>
              <span class="pe-icone-vista" aria-hidden="true">${ic(e.icone)}</span></div>
            <label class="pe-campo">Objetivo <input name="objetivo" value="${esc(e.objetivo || '')}" maxlength="120"></label>
            <div class="pe-areas" role="group" aria-label="Pastas do eixo ${i + 1}">${areas().map((a) => `<label class="mv-check"><input type="checkbox" data-pe-area="${a.id}"${e.areas.includes(a.id) ? ' checked' : ''}> ${esc(a.nome)}</label>`).join('')}</div>
            <button type="button" class="btn-sec mg-perigo pe-tirar" data-pe="tirar" data-pe-i="${i}"${rascunho.length < 2 ? ' disabled' : ''}>${ic('trash')} Tirar este eixo</button>
          </fieldset>`).join('')}
          ${semEixo().length ? `<p class="mv-dica">${ic('info-circle')} Sem eixo (vão para "Outros compromissos"): ${semEixo().map((a) => esc(a.nome)).join(', ')}.</p>` : ''}
          ${rascunho.length < 6 ? `<button type="button" class="btn-sec" data-pe="novo">${ic('plus')} Novo eixo</button>` : ''}
        </div>
        <footer class="mv-pe"><button type="button" class="btn-sec" data-pe="fabrica">${ic('restore')} Voltar aos eixos de fábrica</button>
          <button type="button" class="btn-sec principal" data-pe="salvar">${ic('check')} Salvar eixos</button></footer>
      </form>`;
    }
    function ler() {
      dlg.querySelectorAll('.pe-eixo').forEach((f) => {
        const e = rascunho[Number(f.dataset.peI)];
        e.nome = f.querySelector('[name="nome"]').value.trim();
        e.objetivo = f.querySelector('[name="objetivo"]').value.trim();
        e.icone = f.querySelector('[name="icone"]').value;
        e.areas = [...f.querySelectorAll('[data-pe-area]')].filter((x) => x.checked).map((x) => x.dataset.peArea);
      });
    }
    dlg.onchange = (ev) => {
      const box = ev.target.closest('[data-pe-area]');
      ler();
      // Texto: só guarda (redesenhar no meio troca o botão que a pessoa está clicando).
      if (!box && !ev.target.matches('select')) return;
      // Uma pasta, um eixo: marcou aqui, sai dos outros.
      if (box && box.checked) {
        const i = Number(box.closest('.pe-eixo').dataset.peI);
        rascunho.forEach((e, j) => { if (j !== i) e.areas = e.areas.filter((a) => a !== box.dataset.peArea); });
      }
      render();
    };
    dlg.onclick = (ev) => {
      if (ev.target === dlg) { dlg.close(); return; }
      const b = ev.target.closest('[data-pe]');
      if (!b) return;
      const a = b.dataset.pe;
      if (a === 'fechar') { dlg.close(); return; }
      ler();
      if (a === 'novo') rascunho.push({ id: `eixo-${Date.now().toString(36)}`, nome: 'Novo eixo', objetivo: '', icone: 'leaf', areas: [] });
      if (a === 'tirar') rascunho.splice(Number(b.dataset.peI), 1);
      if (a === 'fabrica') rascunho = JSON.parse(JSON.stringify(FABRICA));
      if (a === 'salvar') {
        erros = validar(rascunho);
        if (!erros.length) {
          try { localStorage.setItem(chave(), JSON.stringify(rascunho)); } catch (e) { /* vale até recarregar */ }
          substituir(rascunho);
          if (GC.auditar) GC.auditar('plano_eixos', { alvo: 'Eixos do plano de governo', detalhe: rascunho.map((e) => `${e.nome}: ${e.areas.map(nomeArea).join(', ') || 'sem pasta'}`).join(' · ') });
          dlg.close();
          if (aoSalvar) aoSalvar();
          return;
        }
      }
      erros = a === 'salvar' ? erros : [];
      render();
    };
    render();
    if (!dlg.open) { dlg.showModal(); const h = dlg.querySelector('h2'); if (h) { h.tabIndex = -1; h.focus(); } }
  }

  // ---------- PDF do plano ----------
  const SIT = { critico: 'Crítico', atencao: 'Atenção', em_dia: 'Em dia', concluida: 'Concluído' };
  function pdf({ area = null } = {}) {
    const J = window.jspdf && window.jspdf.jsPDF;
    if (!J || !GC.metasGoverno) return false;
    const metas = GC.metasGoverno.lista({ area });
    const doc = new J({ unit: 'mm', format: 'a4' });
    const cidade = (GC.cidade && GC.cidade.nome) || 'Vila Dourada';
    const hoje = new Date(GC.agora ? GC.agora() : Date.now());
    const conta = (s) => metas.filter((m) => m.status === s).length;
    const cor = { critico: [185, 28, 28], atencao: [133, 77, 14], em_dia: [0, 128, 128], concluida: [21, 128, 61] };
    // Capa e placar.
    doc.setFillColor(15, 76, 92); doc.rect(0, 0, 210, 38, 'F');
    doc.setTextColor(255); doc.setFont('helvetica', 'bold'); doc.setFontSize(18);
    doc.text(`Plano de governo${area ? ` · ${nomeArea(area)}` : ''}`, 16, 18);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
    doc.text(`Prefeitura de ${cidade} · situação em ${hoje.toLocaleDateString('pt-BR')} · ${metas.length} compromissos`, 16, 27);
    doc.setTextColor(30);
    let y = 50;
    ['critico', 'atencao', 'em_dia', 'concluida'].forEach((s, i) => {
      const x = 16 + i * 46;
      doc.setDrawColor(...cor[s]); doc.setLineWidth(0.8); doc.roundedRect(x, y - 8, 42, 20, 2, 2);
      doc.setTextColor(...cor[s]); doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.text(String(conta(s)), x + 4, y + 2);
      doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(80); doc.text(SIT[s], x + 4, y + 8);
    });
    y += 24;
    const eixos = [...(GC.EIXOS_GOVERNO || []), { id: 'outros', nome: 'Outros compromissos', objetivo: '', areas: null }];
    const doEixo = (e) => metas.filter((m) => (e.areas ? e.areas.includes(m.area) : !(GC.EIXOS_GOVERNO || []).some((x) => x.areas.includes(m.area))));
    eixos.forEach((e) => {
      const ms = doEixo(e);
      if (!ms.length) return;
      const feito = Math.round(ms.reduce((s, m) => s + (m.progressoPct || 0), 0) / ms.length);
      const esperado = Math.round(ms.reduce((s, m) => s + (m.status === 'concluida' ? 100 : m.esperadoPct || 0), 0) / ms.length);
      if (y > 250) { doc.addPage(); y = 20; }
      doc.setTextColor(15, 76, 92); doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.text(e.nome, 16, y);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(90);
      if (e.objetivo) { y += 5; doc.text(doc.splitTextToSize(e.objetivo, 178), 16, y); }
      y += 6;
      doc.setFillColor(228, 236, 237); doc.rect(16, y, 120, 3.2, 'F');
      doc.setFillColor(...(feito < esperado - 25 ? cor.critico : feito < esperado - 10 ? cor.atencao : cor.em_dia)); doc.rect(16, y, 1.2 * Math.min(100, feito), 3.2, 'F');
      doc.setFillColor(242, 106, 33); doc.rect(16 + 1.2 * Math.min(100, esperado) - 0.4, y - 1.2, 0.8, 5.6, 'F');
      doc.setTextColor(40); doc.text(`${feito}% feito · deveria estar em ${esperado}% · ${ms.length} compromissos`, 140, y + 2.6);
      y += 7;
      if (doc.autoTable) {
        doc.autoTable({
          startY: y, margin: { left: 16, right: 16 }, styles: { fontSize: 8, cellPadding: 1.8 }, headStyles: { fillColor: [15, 76, 92] },
          head: [['Compromisso', 'Secretaria', 'Prazo', 'Feito', 'Situação']],
          body: ms.map((m) => [m.titulo, nomeArea(m.area), m.prazoMes ? m.prazoMes.split('-').reverse().join('/') : '—', `${m.progressoPct || 0}%`, SIT[m.status] || m.status]),
          didParseCell: (d) => { if (d.section === 'body' && d.column.index === 4) { const s = Object.keys(SIT).find((k) => SIT[k] === d.cell.raw); if (s) d.cell.styles.textColor = cor[s]; } },
        });
        y = doc.lastAutoTable.finalY + 10;
      } else {
        ms.forEach((m) => { if (y > 280) { doc.addPage(); y = 20; } doc.text(`• ${m.titulo} (${SIT[m.status]}, ${m.progressoPct || 0}%)`, 18, y); y += 5; });
        y += 6;
      }
    });
    const paginas = doc.getNumberOfPages();
    for (let i = 1; i <= paginas; i += 1) { doc.setPage(i); doc.setFontSize(7); doc.setTextColor(130); doc.text(`Golden Atlas · Plano de governo de ${cidade} · página ${i} de ${paginas}`, 105, 290, { align: 'center' }); }
    doc.save(`plano-de-governo${area ? `-${area}` : ''}.pdf`);
    if (GC.auditar) GC.auditar('plano_pdf', { alvo: 'Plano de governo em PDF', detalhe: area ? nomeArea(area) : 'Cidade inteira' });
    return true;
  }

  GC.planoEixos = { abrirEditor, pdf, FABRICA };
})(window.GC = window.GC || {});
