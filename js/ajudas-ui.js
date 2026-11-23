(function (GC) {
  // Telas do pedido de ajuda entre secretarias (regras em js/ajudas.js): o bloco "🤝 Ajuda de outras
  // secretarias" no detalhe da ocorrência e a seção "Pedidos entre secretarias" da aba Cobranças. Cada pedido
  // mostra a situação, o histórico e os botões do papel de quem vê. Botões: data-aj; formulários: data-aj-tipo.
  const esc = (t) => GC.escaparHtml(t);
  const MIN = 60000;
  const sec = (id) => (GC.data.areas.find((a) => a.id === id) || { secretaria: { nome: id } }).secretaria.nome;
  const bairro = (id) => GC.data.bairros.find((b) => b.id === id) || { nome: id };
  const ha = (t) => { const min = Math.round((GC.agora() - t) / MIN); return min < 1 ? 'agora' : `há ${GC.tempoTexto(min)}`; };
  const pode = (acao, alvo) => GC.podeNaAjuda && GC.podeNaAjuda(acao, alvo);

  GC.ERROS_AJUDA = {
    confirmar: 'Confirme na janela que abriu.', // ação crítica (js/app/desfazer.js): o formulário espera a janela
    para: 'Escolha a secretaria.', tipo: 'Escolha o que precisa.', texto: 'Diga o que precisa.', mesma_pasta: 'É a sua própria pasta.',
    ja_pedido: 'Já há um pedido em andamento para essa secretaria.', minutos: 'Diga em quanto tempo chega.', motivo: 'Diga o motivo.',
    estado: 'Este pedido já mudou. Veja o histórico.', nao_parado: 'O pedido ainda está no prazo.', ja_escalado: 'Já foi levado ao prefeito.',
    permissao: 'Não é do seu papel.', ocorrencia: 'A ocorrência já foi resolvida.',
  };

  function selo(a) {
    const aj = GC.ajudas;
    if (a.estado === 'concluido') return '<span class="cb-selo ok">Concluído</span>';
    if (a.estado === 'arquivado') return '<span class="cb-selo andamento">Arquivado</span>';
    if (a.escalado && !a.decididoEm) return '<span class="cb-selo espera">Com o prefeito</span>';
    if (a.estado === 'recusado') return '<span class="cb-selo vencida">Recusado</span>';
    if (aj.parado(a)) return '<span class="cb-selo vencida">Parado</span>';
    if (a.estado === 'aberto') return '<span class="cb-selo aberta">Aguardando</span>';
    return `<span class="cb-selo andamento">${a.determinado ? 'Determinado' : 'Aceito'}</span>`;
  }

  function passo(r) {
    const extra = r.texto ? ` · “${esc(r.texto)}”` : '';
    const sim = r.simulada ? ' <small class="cb-sim">simulada</small>' : '';
    const o = {
      aceito: `<b>Aceitou</b>: chega em ${GC.tempoTexto(r.minutos)}${extra}`,
      recusado: `<b>Recusou</b>${extra}`,
      concluido: `✅ <b>Concluído</b>${extra}`,
      escalado: `<b>Levado ao prefeito</b>${extra}`,
      determinado: `<b>O prefeito determinou a ajuda</b>${extra}`,
      arquivado: `<b>O prefeito arquivou o pedido</b>${extra}`,
    }[r.tipo] || esc(r.tipo);
    return `<li><span>${ha(r.em)}${r.quem ? ` · ${esc(r.quem)}` : ''}</span><p>${o}${sim}</p></li>`;
  }

  const rodape = (rotulo) => `<p class="cb-erro" role="alert"></p><div class="cb-form-pe"><button type="submit" class="btn-acao principal">${rotulo}</button><button type="button" class="btn-sec" data-aj-fechar>Cancelar</button></div>`;
  const atalhos = (valores) => `<div class="cb-atalhos">${valores.map((v) => `<label><input type="radio" name="minutos" value="${v}"><span>${v} min</span></label>`).join('')}</div>`;

  // Botões e formulários do papel de quem vê.
  function acoes(a) {
    const id = esc(a.id);
    const b = [];
    const f = [];
    const aberto = a.estado === 'aberto';
    const pendentePrefeito = a.escalado && !a.decididoEm && a.estado !== 'concluido' && a.estado !== 'arquivado';
    if (aberto && pode('aceitar', a)) {
      b.push(`<button type="button" class="btn-acao principal" data-aj-form="aceitar" data-aj-id="${id}">Aceitar</button>`);
      b.push(`<button type="button" class="btn-sec" data-aj-form="recusar" data-aj-id="${id}">Recusar</button>`);
      f.push(`<form class="cb-form" data-aj-tipo="aceitar" data-aj-id="${id}" hidden><p class="cb-form-tit">Em quanto tempo a ajuda chega?</p>${atalhos([30, 60, 120])}
        <label class="cb-campo">Observação (opcional)<input type="text" name="texto" maxlength="200" placeholder="Ex.: viatura 12 sai da base agora"></label>${rodape('Aceitar')}</form>`);
      f.push(`<form class="cb-form" data-aj-tipo="recusar" data-aj-id="${id}" hidden><p class="cb-form-tit">Por que não dá agora?</p>
        <label class="cb-campo">Motivo<textarea name="texto" rows="2" maxlength="300"></textarea></label>${rodape('Recusar')}</form>`);
    }
    if (a.estado === 'aceito' && pode('concluir', a)) b.push(`<button type="button" class="btn-sec" data-aj="concluir" data-aj-id="${id}">✅ Ajuda concluída</button>`);
    if (!pendentePrefeito && (a.estado === 'recusado' || GC.ajudas.parado(a)) && pode('escalar', a)) {
      b.push(`<button type="button" class="btn-acao principal" data-aj="escalar" data-aj-id="${id}">Levar ao prefeito</button>`);
    }
    if (pendentePrefeito && pode('determinar', a)) {
      b.push(`<button type="button" class="btn-acao principal" data-aj-form="determinar" data-aj-id="${id}">Determinar a ajuda</button>`);
      b.push(`<button type="button" class="btn-sec" data-aj-form="arquivar" data-aj-id="${id}">Arquivar</button>`);
      f.push(`<form class="cb-form" data-aj-tipo="determinar" data-aj-id="${id}" hidden><p class="cb-form-tit">A ${esc(sec(a.para))} terá 2 h para ajudar.</p>
        <label class="cb-campo">Orientação (opcional)<input type="text" name="texto" maxlength="200"></label>${rodape('Determinar')}</form>`);
      f.push(`<form class="cb-form" data-aj-tipo="arquivar" data-aj-id="${id}" hidden><p class="cb-form-tit">Arquivar o pedido</p>
        <label class="cb-campo">Motivo<input type="text" name="texto" maxlength="200" placeholder="Ex.: a Saúde resolve com a equipe própria"></label>${rodape('Arquivar')}</form>`);
    }
    return (b.length ? `<div class="cb-botoes">${b.join('')}</div>` : '') + f.join('');
  }

  // Um pedido: de quem para quem, o que, a situação, o histórico e as ações. comTitulo: na lista da aba.
  function pedido(a, { comTitulo = false } = {}) {
    return `<article class="aj-pedido${GC.ajudas.parado(a) || a.estado === 'recusado' ? ' parado' : ''}" data-aj-caixa="${esc(a.id)}"${comTitulo ? ` data-aj-abrir="${esc(a.ocorrenciaId)}" data-abre-gaveta tabindex="0"` : ''}>
      <div class="cb-item-topo"><h4>${comTitulo ? `${esc(a.retrato.titulo)} · ` : ''}${esc(sec(a.de))} → ${esc(sec(a.para))}</h4>${selo(a)}</div>
      ${comTitulo ? `<div class="cb-item-meta">${esc(bairro(a.retrato.bairroId).nome)} · pedido ${ha(a.em)}</div>` : ''}
      <p class="aj-oque"><b>${esc(GC.PEDIDOS_AJUDA[a.tipo])}:</b> ${esc(a.texto)}</p>
      <p class="cb-resumo">${esc(GC.resumoAjuda(a).replace(/^🤝 /, ''))}</p>
      ${a.respostas.length ? `<ul class="cb-historico">${a.respostas.map(passo).join('')}</ul>` : ''}
      ${acoes(a)}
      ${comTitulo ? `<div class="cb-item-pe"><button type="button" class="alerta-ver" data-aj-abrir="${esc(a.ocorrenciaId)}">Detalhes</button></div>` : ''}
    </article>`;
  }

  // Bloco no detalhe da ocorrência: os pedidos dela e, para a pasta da ocorrência, o "Pedir ajuda".
  GC.htmlBlocoAjuda = function (o) {
    if (!o || !GC.ajudas) return '';
    const lista = GC.ajudas.daOcorrencia(o.id);
    const podePedir = pode('pedir', o);
    if (!lista.length && !podePedir) return '';
    const areas = GC.data.areas.filter((a) => a.id !== o.area).map((a) => `<option value="${a.id}">${esc(a.secretaria.nome)}</option>`).join('');
    const tipos = Object.entries(GC.PEDIDOS_AJUDA).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('');
    return `
      <section class="aj-bloco" data-aj-caixa="bloco-${esc(o.id)}">
        <div class="cb-bloco-cab"><h3>🤝 Ajuda de outras secretarias</h3>${podePedir ? `<button type="button" class="btn-sec" data-aj-form="pedir" data-aj-id="${esc(o.id)}">Pedir ajuda</button>` : ''}</div>
        ${lista.length ? lista.map((a) => pedido(a)).join('') : '<p class="op-nota">Precisa de outra pasta? Peça aqui: a resposta e o prazo ficam registrados, e o prefeito vê.</p>'}
        ${podePedir ? `<form class="cb-form" data-aj-tipo="pedir" data-aj-id="${esc(o.id)}" hidden>
          <p class="cb-form-tit">Pedir ajuda a outra secretaria</p>
          <label class="cb-campo">Secretaria<select name="para"><option value="">Escolha</option>${areas}</select></label>
          <label class="cb-campo">O que precisa<select name="tipo"><option value="">Escolha</option>${tipos}</select></label>
          <label class="cb-campo">Detalhe<textarea name="texto" rows="2" maxlength="300" placeholder="Ex.: uma viatura para organizar a fila na porta da UBS"></textarea></label>
          <p class="op-nota">A outra pasta tem 1 h para responder. Se recusar ou não responder, você pode levar ao prefeito.</p>
          ${rodape('Pedir')}
        </form>` : ''}
      </section>`;
  };

  // Seção da aba Cobranças. Vazia: nada (a aba já tem a sua frase).
  GC.htmlAjudasLista = function (perfil = GC.perfil) {
    if (!GC.ajudas) return '';
    const { grupos } = GC.ajudas.grupos(perfil || { id: 'prefeito' });
    const cheios = grupos.filter((g) => g.itens.length);
    if (!cheios.length) return '';
    return cheios.map((g) => `<h3 class="alertas-divisor cb-grupo ${g.conta ? 'conta' : ''}">🤝 ${esc(g.titulo)} · ${g.itens.length}</h3>${g.itens.map((a) => pedido(a, { comTitulo: true })).join('')}`).join('');
  };

  // acoes: { executar(acao, id, dados) → { ok, motivo }, abrir(ocorrenciaId), aoConcluir?() }
  GC.ligarAjuda = function (raiz, acoesApp) {
    if (!raiz || raiz.dataset.ajLigado) return;
    raiz.dataset.ajLigado = '1';
    raiz.addEventListener('click', (e) => {
      const alvo = e.target.closest('[data-aj], [data-aj-form], [data-aj-fechar], [data-aj-abrir]');
      if (!alvo || !raiz.contains(alvo)) return;
      if (alvo.matches('[data-aj]')) {
        e.stopPropagation();
        const r = acoesApp.executar(alvo.dataset.aj, alvo.dataset.ajId, {}) || {};
        if (r.ok && acoesApp.aoConcluir) acoesApp.aoConcluir();
        return;
      }
      if (alvo.matches('[data-aj-form]')) {
        e.stopPropagation();
        const dono = alvo.closest('[data-aj-caixa]');
        const tipo = alvo.dataset.ajForm;
        dono.querySelectorAll(':scope > .cb-form').forEach((f) => { f.hidden = f.dataset.ajTipo !== tipo || !f.hidden; });
        const aberto = dono.querySelector(`:scope > .cb-form[data-aj-tipo="${tipo}"]:not([hidden])`);
        if (aberto) { const campo = aberto.querySelector('select, textarea, input:not([type=radio])'); if (campo) campo.focus(); }
        return;
      }
      if (alvo.matches('[data-aj-fechar]')) { e.stopPropagation(); alvo.closest('.cb-form').hidden = true; return; }
      if (e.target.closest('.cb-form, button:not([data-aj-abrir])')) return;
      if (acoesApp.abrir) acoesApp.abrir(alvo.dataset.ajAbrir);
    });
    raiz.addEventListener('submit', (e) => {
      const form = e.target.closest('.cb-form[data-aj-tipo]');
      if (!form) return;
      e.preventDefault();
      e.stopPropagation();
      const f = new FormData(form);
      const dados = { texto: (f.get('texto') || '').toString(), para: f.get('para') || '', tipo: f.get('tipo') || '', minutos: Number(f.get('minutos')) || 0 };
      const r = acoesApp.executar(form.dataset.ajTipo, form.dataset.ajId, dados) || { ok: false };
      if (!r.ok) { form.querySelector('.cb-erro').textContent = GC.ERROS_AJUDA[r.motivo] || 'Não deu certo. Tente de novo.'; return; }
      form.hidden = true;
      if (acoesApp.aoConcluir) acoesApp.aoConcluir();
    });
  };
})(window.GC = window.GC || {});
