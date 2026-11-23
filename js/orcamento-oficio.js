(function (GC) {
  // Orçamento (pauta do Paulo Fiuza, item 4): as regras de alerta e o ofício gerado pela Maia.
  //   - Regras de alerta: os limites que decidem o que vira "Precisa de você" (js/orcamento-gestao.js, regras()).
  //     Só o gestor geral muda; os outros perfis veem as regras em vigor.
  //   - Ofício com a Maia: para um recurso de fora em risco, ofício ao órgão pedindo a prorrogação do prazo; para um
  //     contrato sem licitação a tempo, memorando à secretaria. É um rascunho preenchido com os números da tela:
  //     copia, baixa em PDF ou abre na conversa com a Maia. Vai para a auditoria.
  const ic = (n) => `<i class="ti ti-${n}" aria-hidden="true"></i>`;
  const esc = (t) => (GC.escaparHtml ? GC.escaparHtml(t) : String(t));
  const og = () => GC.orcamentoGestao;
  const nomeArea = (id) => ((GC.data && GC.data.areas) || []).find((a) => a.id === id) || null;
  const secretaria = (id) => { const a = nomeArea(id); return a ? (a.secretaria && a.secretaria.nome) || a.nome : 'Secretaria'; };
  const dataBr = (d) => new Date(d).toLocaleDateString('pt-BR');
  const porExtenso = (d) => new Date(d).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });
  const cidade = () => (GC.cidade && GC.cidade.nome) || 'Vila Dourada';
  const prefeito = () => {
    const u = ((GC.data && GC.data.usuarios) || []).find((x) => /^prefeit/i.test(x.cargo || ''));
    return u ? { nome: u.nome, cargo: `${u.cargo} de ${cidade()}` } : { nome: 'Prefeito(a) Municipal', cargo: `Prefeitura de ${cidade()}` };
  };
  const podeEditarRegras = () => !(GC.visaoSimples && GC.visaoSimples.forcada()) && (!GC.visaoDe || GC.visaoDe(GC.perfil) === 'cidade');
  const numero = () => { const n = Number(sessionStorage.getItem('gc.oficio.n') || 140) + 1; try { sessionStorage.setItem('gc.oficio.n', String(n)); } catch (e) { /* nada */ } return n; };

  // ---------- documentos ----------
  function oficioRecurso(x, n) {
    const p = prefeito();
    const ano = new Date(GC.agora ? GC.agora() : Date.now()).getFullYear();
    return {
      tipo: 'Ofício', titulo: `Ofício nº ${n}/${ano} – GAB`, para: x.orgao,
      assunto: `Execução de "${x.nome}": pedido de prorrogação do prazo de execução`,
      corpo: [
        'Senhor(a) Responsável,',
        `1. A Prefeitura de ${cidade()} recebeu ${x.recebidoPct}% dos R$ ${og().fmtMi(x.valorMi)} referentes a "${x.nome}" e executou, até esta data, ${x.executadoPct}% do valor (R$ ${og().fmtMi(x.executadoMi)}). O prazo de execução termina em ${dataBr(x.prazo)}, daqui a ${x.prazoDias} dias.`,
        `2. A execução ficou abaixo do previsto pelo tempo do processo de compras e pela mudança de cronograma da ${secretaria(x.area)}. [Confirmar a justificativa com a secretaria antes de assinar.]`,
        `3. Para concluir o objeto sem devolver o saldo de R$ ${og().fmtMi(x.saldoMi)}, solicitamos a prorrogação do prazo de execução por 180 (cento e oitenta) dias, sem acréscimo de valor.`,
        '4. Encaminhamos em anexo o cronograma físico-financeiro atualizado e o relatório de execução.',
        'Atenciosamente,',
      ],
      assinatura: p,
    };
  }
  function memorandoContrato(c, n) {
    const p = prefeito();
    const ano = new Date(GC.agora ? GC.agora() : Date.now()).getFullYear();
    const lic = c.cobertura === 'apertado';
    return {
      tipo: 'Memorando', titulo: `Memorando nº ${n}/${ano} – GAB`, para: secretaria(c.area),
      assunto: `Contrato "${c.nome}" vence em ${c.venceDias} dias ${lic ? 'antes do fim da licitação' : 'sem licitação aberta'}`,
      corpo: [
        'Senhor(a) Secretário(a),',
        `1. O contrato "${c.nome}"${c.empresa ? `, com ${c.empresa},` : ''} vence em ${dataBr(c.vence)}, daqui a ${c.venceDias} dias. ${lic ? 'A licitação aberta para substituí-lo não termina antes do vencimento.' : 'Não há licitação aberta para substituí-lo.'}`,
        `2. Solicito que a ${secretaria(c.area)} apresente, em até 5 (cinco) dias úteis, ${lic ? 'a proposta de aditivo de prazo do contrato atual, com a justificativa' : 'o termo de referência e o cronograma da nova licitação'}, para evitar a interrupção do serviço e a contratação emergencial.`,
        '3. Peço também o registro desta providência no painel (Demandas), para o acompanhamento do Gabinete.',
        'Atenciosamente,',
      ],
      assinatura: p,
    };
  }
  function documento(id) {
    const r = og().resumo({});
    const x = r.recursos.find((y) => y.id === id);
    if (x) return oficioRecurso(x, numero());
    const c = r.contratos.find((y) => y.id === id);
    if (c) return memorandoContrato(c, numero());
    return null;
  }
  const textoDe = (d) => [`PREFEITURA DE ${cidade().toUpperCase()}`, 'Gabinete', '', d.titulo, `${cidade()}, ${porExtenso(GC.agora ? GC.agora() : Date.now())}.`, '', `${d.tipo === 'Ofício' ? 'A(o)' : 'Para:'} ${d.para}`, `Assunto: ${d.assunto}`, '', ...d.corpo.flatMap((p) => [p, '']), d.assinatura.nome, d.assinatura.cargo].join('\n');

  function baixarPdf(d) {
    const J = window.jspdf && window.jspdf.jsPDF;
    if (!J) return false;
    const doc = new J({ unit: 'mm', format: 'a4' });
    let y = 22;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12);
    doc.text(`PREFEITURA DE ${cidade().toUpperCase()}`, 105, y, { align: 'center' }); y += 6;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.text('Gabinete', 105, y, { align: 'center' }); y += 14;
    doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.text(d.titulo, 20, y); y += 6;
    doc.setFont('helvetica', 'normal'); doc.text(`${cidade()}, ${porExtenso(GC.agora ? GC.agora() : Date.now())}.`, 20, y); y += 10;
    doc.text(`${d.tipo === 'Ofício' ? 'A(o)' : 'Para:'} ${d.para}`, 20, y); y += 6;
    const ass = doc.splitTextToSize(`Assunto: ${d.assunto}`, 170); doc.setFont('helvetica', 'bold'); doc.text(ass, 20, y); y += ass.length * 5.5 + 6;
    doc.setFont('helvetica', 'normal');
    d.corpo.forEach((par) => { const l = doc.splitTextToSize(par, 170); doc.text(l, 20, y); y += l.length * 5.5 + 4; });
    y += 14; doc.text(d.assinatura.nome, 105, y, { align: 'center' }); y += 5; doc.setFontSize(10); doc.text(d.assinatura.cargo, 105, y, { align: 'center' });
    doc.setFontSize(8); doc.setTextColor(120); doc.text('Rascunho gerado pela Maia (Golden Atlas) com os dados do painel. Revise antes de assinar.', 105, 287, { align: 'center' });
    doc.save(`${d.titulo.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}.pdf`);
    return true;
  }

  // ---------- diálogos ----------
  let dlg = null;
  function dialogo() {
    if (dlg) return dlg;
    dlg = document.createElement('dialog');
    dlg.className = 'mv-dialogo oc-dlg';
    document.body.appendChild(dlg);
    dlg.addEventListener('click', (e) => { if (e.target === dlg || e.target.closest('[data-dlg-fechar]')) dlg.close(); });
    return dlg;
  }

  function abrirOficio(id, { aoMaia } = {}) {
    const r = og().resumo({});
    const lista = [
      ...r.recursos.filter((x) => x.situacao === 'risco' || x.situacao === 'atencao').map((x) => ({ id: x.id, rot: `Ofício · ${x.nome}` })),
      ...r.contratos.filter((c) => c.cobertura === 'sem_licitacao' || c.cobertura === 'apertado').map((c) => ({ id: c.id, rot: `Memorando · ${c.nome}` })),
    ];
    let atual = id || (lista[0] && lista[0].id);
    const d0 = dialogo();
    let doc = null;
    function render() {
      doc = documento(atual);
      if (!doc) { d0.innerHTML = `<div class="oc-dlg-corpo"><p>Nada para escrever agora.</p><button type="button" class="btn-sec" data-dlg-fechar>Fechar</button></div>`; return; }
      d0.innerHTML = `<div class="mv-form">
        <header class="mv-cab"><div><p class="mv-rotulo">${ic('sparkles')} Rascunho da Maia · revise antes de assinar</p><h2>${ic('file-text')} ${esc(doc.tipo)} com a Maia</h2></div>
          <button type="button" class="gaveta-x" data-dlg-fechar aria-label="Fechar">${ic('x')}</button></header>
        <div class="oc-dlg-corpo">
          ${lista.length > 1 ? `<label class="oc-dlg-sel">Documento <select data-of-sel>${lista.map((l) => `<option value="${esc(l.id)}"${l.id === atual ? ' selected' : ''}>${esc(l.rot)}</option>`).join('')}</select></label>` : ''}
          <article class="oc-oficio" aria-label="Texto do documento">
            <p class="oc-of-org"><b>PREFEITURA DE ${esc(cidade().toUpperCase())}</b><br>Gabinete</p>
            <p><b>${esc(doc.titulo)}</b><br>${esc(cidade())}, ${esc(porExtenso(GC.agora ? GC.agora() : Date.now()))}.</p>
            <p>${doc.tipo === 'Ofício' ? 'A(o)' : 'Para:'} ${esc(doc.para)}<br><b>Assunto:</b> ${esc(doc.assunto)}</p>
            ${doc.corpo.map((p) => `<p>${esc(p).replace(/\[(.+?)\]/g, '<mark>[$1]</mark>')}</p>`).join('')}
            <p class="oc-of-ass">${esc(doc.assinatura.nome)}<br><small>${esc(doc.assinatura.cargo)}</small></p>
          </article>
          <p class="oc-of-nota" role="status"></p>
        </div>
        <footer class="mv-pe">
          <span class="oc-of-acoes"><button type="button" class="btn-sec" data-of="copiar">${ic('copy')} Copiar texto</button>
          <button type="button" class="btn-sec" data-of="maia">${ic('sparkles')} Ajustar com a Maia</button></span>
          <button type="button" class="btn-sec principal" data-of="pdf">${ic('file-download')} Baixar PDF</button>
        </footer></div>`;
    }
    d0.onchange = (e) => { const s = e.target.closest('[data-of-sel]'); if (s) { atual = s.value; render(); } };
    d0.onclick = async (e) => {
      if (e.target === d0 || e.target.closest('[data-dlg-fechar]')) { d0.close(); return; }
      const b = e.target.closest('[data-of]');
      if (!b || !doc) return;
      const nota = d0.querySelector('.oc-of-nota');
      if (b.dataset.of === 'copiar') {
        try { await navigator.clipboard.writeText(textoDe(doc)); nota.textContent = 'Texto copiado.'; } catch (er) { nota.textContent = 'Não deu para copiar aqui: selecione o texto e copie.'; }
      }
      if (b.dataset.of === 'pdf') nota.textContent = baixarPdf(doc) ? 'PDF baixado.' : 'O gerador de PDF não carregou (precisa de internet).';
      if (b.dataset.of === 'maia') { d0.close(); if (aoMaia) aoMaia(`Revise este ${doc.tipo.toLowerCase()} e deixe mais formal: ${doc.assunto}`); }
      if (GC.auditar && b.dataset.of !== 'maia') GC.auditar('oficio_maia', { alvo: doc.titulo, detalhe: doc.assunto });
    };
    render();
    if (!d0.open) { d0.showModal(); const h = d0.querySelector('h2'); if (h) { h.tabIndex = -1; h.focus(); } }
  }

  const CAMPOS = [
    { k: 'recursoRiscoDias', frase: (i) => `Recurso de fora em <b>risco de devolução</b> quando faltam até ${i} dias para o prazo`, un: 'dias' },
    { k: 'recursoRiscoExec', frase: (i) => `…e ele executou menos de ${i}% do valor`, un: 'por cento executado' },
    { k: 'recursoAtencaoDias', frase: (i) => `Recurso em <b>atenção</b> quando faltam até ${i} dias para o prazo`, un: 'dias' },
    { k: 'recursoAtencaoExec', frase: (i) => `…e ele executou menos de ${i}% do valor`, un: 'por cento executado' },
    { k: 'contratoJanelaDias', frase: (i) => `Contrato que vence em até ${i} dias <b>precisa de licitação aberta</b>`, un: 'dias' },
    { k: 'contratoCriticoDias', frase: (i) => `…e vira <b>crítico</b> a partir de ${i} dias do vencimento`, un: 'dias' },
    { k: 'atrasoPp', frase: (i) => `Secretaria <b>atrasada</b> quando o pago fica ${i} pontos abaixo do esperado no mês`, un: 'p.p.' },
  ];
  function abrirRegras({ aoSalvar } = {}) {
    const d0 = dialogo();
    const pode = podeEditarRegras();
    let erros = {};
    function render() {
      const R = og().regras();
      const P = og().REGRAS_PADRAO;
      const r = og().resumo({});
      const conta = `${r.pendencias.length} ${r.pendencias.length === 1 ? 'ponto' : 'pontos'} em "Precisa de você" com as regras de agora`;
      d0.innerHTML = `<form class="mv-form" novalidate>
        <header class="mv-cab"><div><p class="mv-rotulo">Orçamento e contratos</p><h2>${ic('bell-cog')} Regras de alerta do orçamento</h2></div>
          <button type="button" class="gaveta-x" data-dlg-fechar aria-label="Fechar">${ic('x')}</button></header>
        <div class="oc-dlg-corpo">
          <p class="mv-dica">O que entra em "Precisa de você", no Resumo de hoje e nas respostas da Maia. ${pode ? '' : '<b>Só o gestor geral muda estas regras.</b>'}</p>
          <ul class="oc-regras">${CAMPOS.map((c) => {
            const campo = `<input type="number" name="${c.k}" value="${R[c.k]}" inputmode="numeric"${pode ? '' : ' disabled'} aria-label="${esc(c.un)}">`;
            return `<li${erros[c.k] ? ' class="erro"' : ''}><span>${c.frase(`<span class="oc-regra-campo">${campo}</span>`)}</span>${R[c.k] !== P[c.k] ? `<small class="oc-regra-mudou">padrão: ${P[c.k]}</small>` : ''}${erros[c.k] ? `<small class="oc-regra-erro">${esc(erros[c.k])}</small>` : ''}</li>`;
          }).join('')}</ul>
          <p class="oc-of-nota" role="status">${esc(conta)}</p>
        </div>
        <footer class="mv-pe">${pode ? `<button type="button" class="btn-sec" data-rg="padrao">${ic('restore')} Voltar ao padrão</button><button type="button" class="btn-sec principal" data-rg="salvar">${ic('check')} Salvar regras</button>` : `<span></span><button type="button" class="btn-sec" data-dlg-fechar>Fechar</button>`}</footer>
      </form>`;
    }
    d0.onchange = null;
    d0.onclick = (e) => {
      if (e.target === d0 || e.target.closest('[data-dlg-fechar]')) { d0.close(); return; }
      const b = e.target.closest('[data-rg]');
      if (!b) return;
      if (b.dataset.rg === 'padrao') { og().restaurarRegras(); erros = {}; render(); if (aoSalvar) aoSalvar(); if (GC.auditar) GC.auditar('orcamento_regras', { alvo: 'Regras do orçamento', detalhe: 'Voltou ao padrão' }); return; }
      if (b.dataset.rg === 'salvar') {
        const dados = {};
        d0.querySelectorAll('input[name]').forEach((i) => { dados[i.name] = i.value; });
        const res = og().salvarRegras(dados);
        erros = res.ok ? {} : res.erros;
        render();
        if (res.ok) {
          d0.querySelector('.oc-of-nota').textContent = `Regras salvas. ${d0.querySelector('.oc-of-nota').textContent}`;
          if (aoSalvar) aoSalvar();
          if (GC.auditar) GC.auditar('orcamento_regras', { alvo: 'Regras do orçamento', detalhe: Object.entries(res.regras).map(([k, v]) => `${k}=${v}`).join(', ') });
        }
      }
    };
    render();
    if (!d0.open) { d0.showModal(); const h = d0.querySelector('h2'); if (h) { h.tabIndex = -1; h.focus(); } }
  }

  GC.orcamentoOficio = { abrir: abrirOficio, abrirRegras, documento, textoDe, podeEditarRegras };
})(window.GC = window.GC || {});
