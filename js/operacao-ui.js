(function (GC) {
  // Telas da operação da pasta (regras em js/operacao.js e na store): o bloco "Operação da pasta" no detalhe
  // da ocorrência (só o secretário da pasta), o quadro "Equipes agora" da tela Minha secretaria e a evidência
  // de quem resolveu (todos veem). Botões levam data-op="<ação>"; formulários, data-op-tipo. Quem executa é o app.
  const esc = (t) => GC.escaparHtml(t);
  const MIN = 60000;
  const bairro = (id) => GC.data.bairros.find((b) => b.id === id) || { nome: id };
  const ha = (t) => { const min = Math.round((GC.agora() - t) / MIN); return min < 1 ? 'agora' : `há ${GC.tempoTexto(min)}`; };
  const SELO = { livre: 'ok', deslocamento: 'andamento', no_local: 'espera' };

  GC.ERROS_OPERACAO = {
    confirmar: 'Confirme na janela que abriu.', // ação crítica (js/app/desfazer.js): o formulário espera a janela
    texto: 'Escreva o que foi feito.',
    motivo: 'Diga por que não é da sua pasta.',
    para: 'Escolha a pasta certa.',
    principal: 'Escolha a ocorrência principal.',
    foto_grande: 'A foto ficou grande demais. Tente outra.',
    estado: 'Esta ocorrência já mudou. Veja a linha do tempo.',
    permissao: 'Só o secretário da pasta faz isso.',
  };

  const seloEquipe = (s) => `<span class="cb-selo ${SELO[s]}">${GC.SITUACAO_EQUIPE[s]}</span>`;

  // O que foi feito, com a foto (todos os perfis veem na ocorrência resolvida).
  GC.htmlEvidencia = function (o) {
    if (!o || !o.evidencia) return '';
    const ev = o.evidencia;
    return `<section class="op-evidencia"><h3>✅ O que foi feito</h3><p>${esc(ev.texto)}</p>
      ${ev.foto ? `<img class="cb-foto" src="${esc(ev.foto)}" alt="Foto enviada como evidência">` : ''}
      <small>${ev.quem ? `${esc(ev.quem)} · ` : ''}${ha(ev.t)}</small></section>`;
  };

  function listaEquipes(equipes, o) {
    return `<ul class="op-equipes">${equipes.map((e) => {
      const onde = e.ocorrencia ? `${esc(e.ocorrencia.titulo)} · ${ha(e.desde)}` : `base: ${esc(bairro((GC.data.bairros[e.base % GC.data.bairros.length] || {}).id).nome)}`;
      const botao = e.situacao === 'livre' && o ? `<button type="button" class="btn-acao principal" data-op="despachar" data-op-equipe="${esc(e.id)}" data-op-id="${esc(o.id)}">Despachar</button>` : '';
      return `<li><div><b>${esc(e.nome)}</b> ${seloEquipe(e.situacao)}<small>${onde}</small></div>${botao}</li>`;
    }).join('')}</ul>`;
  }

  function formularios(o, store) {
    const id = esc(o.id);
    const areas = GC.data.areas.filter((a) => a.id !== o.area).map((a) => `<option value="${a.id}">${esc(a.secretaria.nome)}</option>`).join('');
    const cands = GC.candidatasDuplicada(store, o).map((x) => `<option value="${esc(x.id)}">${esc(x.titulo)} · ${esc(bairro(x.bairroId).nome)}</option>`).join('');
    const rodape = (rotulo) => `<p class="cb-erro" role="alert"></p><div class="cb-form-pe"><button type="submit" class="btn-acao principal">${rotulo}</button><button type="button" class="btn-sec" data-op-fechar>Cancelar</button></div>`;
    return `
      <form class="cb-form" data-op-tipo="resolver" data-op-id="${id}" hidden>
        <p class="cb-form-tit">O que foi feito?</p>
        <label class="cb-campo">Descrição<textarea name="texto" rows="3" maxlength="400"></textarea></label>
        <label class="cb-campo">Foto (opcional)<input type="file" name="foto" accept="image/*"></label>
        ${GC.temPedidoDeMorador && GC.temPedidoDeMorador(o) ? '<p class="op-nota">💬 Veio de pedido de morador: quem pediu vai ver esta descrição e a foto no Portal do Cidadão.</p>' : ''}
        ${rodape('Marcar como resolvida')}
      </form>
      <form class="cb-form" data-op-tipo="devolver" data-op-id="${id}" hidden>
        <p class="cb-form-tit">Não é da sua pasta? Mande para a certa.</p>
        <label class="cb-campo">Pasta certa<select name="para"><option value="">Escolha</option>${areas}</select></label>
        <label class="cb-campo">Por que veio errado<textarea name="motivo" rows="2" maxlength="300" placeholder="Ex.: o problema é na rede elétrica, não no posto"></textarea></label>
        <p class="op-nota">A pasta certa recebe o prazo inteiro para pôr equipe em campo; o tempo que ficou aqui volta para o prazo de resolver. A devolução fica registrada na regra que encaminhou.</p>
        ${rodape('Devolver')}
      </form>
      <form class="cb-form" data-op-tipo="juntar" data-op-id="${id}" hidden>
        <p class="cb-form-tit">É o mesmo problema de outra ocorrência?</p>
        ${cands ? `<label class="cb-campo">Juntar a<select name="principal"><option value="">Escolha</option>${cands}</select></label>
        <p class="op-nota">Esta fecha como duplicada e os afetados passam para a escolhida.</p>
        ${rodape('Juntar')}` : '<p class="op-nota">Nenhuma outra ocorrência aberta da pasta para juntar.</p><div class="cb-form-pe"><button type="button" class="btn-sec" data-op-fechar>Fechar</button></div>'}
      </form>`;
  }

  // Bloco do secretário no detalhe da ocorrência aberta da pasta dele.
  GC.htmlBlocoOperacao = function (o, store, perfil = GC.perfil) {
    if (!o || !store || !GC.podeOperar || !GC.podeOperar('despachar', o, perfil)) return '';
    const id = esc(o.id);
    const nome = o.equipeId ? GC.nomeEquipe(o.equipeId) : null;
    let topo;
    if (o.status === 'encaminhada' && !o.equipeId) {
      const equipes = GC.situacaoEquipes(store, o.area);
      const livres = equipes.filter((e) => e.situacao === 'livre').length;
      topo = `<p class="op-frase">${livres ? `Despache uma equipe: ${livres === 1 ? '1 livre' : `${livres} livres`} agora.` : 'Nenhuma equipe livre agora. Veja qual está há mais tempo no local.'}</p>${listaEquipes(equipes, o)}`;
    } else if (o.status === 'encaminhada') {
      topo = `<p class="op-frase">🚐 <b>${esc(nome)}</b> a caminho ${ha(o.despachadaEm)}.</p>
        <div class="cb-botoes"><button type="button" class="btn-acao principal" data-op="chegar" data-op-id="${id}">Chegou ao local</button></div>`;
    } else {
      topo = `<p class="op-frase">🚧 <b>${esc(nome || 'Equipe')}</b> no local.</p>
        <div class="cb-botoes"><button type="button" class="btn-acao principal" data-op-form="resolver" data-op-id="${id}">✅ Resolver</button></div>`;
    }
    // Delegação a diretor de unidade (js/data-usuarios.js): quem está com ela e, para o secretário, o "Delegar".
    const eu = GC.usuarioAtual ? GC.usuarioAtual() : null;
    const delegado = o.delegadoA && GC.buscarUsuario ? GC.buscarUsuario(o.delegadoA) : null;
    const podeDelegar = GC.podeOperar('delegar', o, perfil);
    const secretario = podeDelegar; // devolver e juntar também são só do secretário
    const diretores = (GC.data.usuarios || []).filter((u) => u.area === o.area && u.perfil === 'setor' && GC.nivelDe(u) === 'unidade' && u.ativo !== false);
    const comQuem = delegado ? `<p class="op-frase">👤 ${eu && eu.id === delegado.id ? '<b>Delegada a você</b>' : `Com <b>${esc(delegado.nome)}</b> (${esc(delegado.unidade)})`}</p>` : '';
    const formDelegar = podeDelegar && diretores.length ? `<form class="cb-form" data-op-tipo="delegar" data-op-id="${id}" hidden>
        <p class="cb-form-tit">Delegar a um diretor de unidade</p>
        <label class="cb-campo">Diretor<select name="usuarioId">${delegado ? '<option value="">Voltar para o secretário</option>' : '<option value="">Escolha</option>'}${diretores.filter((u) => !delegado || u.id !== delegado.id).map((u) => `<option value="${esc(u.id)}">${esc(u.nome)} · ${esc(u.unidade)}</option>`).join('')}</select></label>
        <p class="op-nota">O diretor passa a despachar, marcar a chegada, resolver e responder a cobrança desta ocorrência.</p>
        <p class="cb-erro" role="alert"></p><div class="cb-form-pe"><button type="submit" class="btn-acao principal">${delegado ? 'Trocar' : 'Delegar'}</button><button type="button" class="btn-sec" data-op-fechar>Cancelar</button></div>
      </form>` : '';
    return `
      <section class="op-bloco" data-op-bloco="${id}">
        <div class="cb-bloco-cab"><h3>🚐 Operação da pasta</h3></div>
        ${comQuem}
        ${topo}
        ${secretario ? `<div class="cb-botoes op-mais">
          ${formDelegar ? `<button type="button" class="btn-sec" data-op-form="delegar" data-op-id="${id}">👤 ${delegado ? 'Trocar delegação' : 'Delegar'}</button>` : ''}
          <button type="button" class="btn-sec" data-op-form="devolver" data-op-id="${id}">↩ Devolver (pasta errada)</button>
          <button type="button" class="btn-sec" data-op-form="juntar" data-op-id="${id}">🔗 Juntar com outra</button>
        </div>` : ''}
        ${formularios(o, store)}${formDelegar}
      </section>`;
  };

  // Quadro "Equipes agora" (tela Minha secretaria): uma linha por equipe; a ocupada abre a ocorrência.
  GC.htmlEquipesPasta = function (store, area) {
    const equipes = GC.situacaoEquipes(store, area);
    if (!equipes.length) return '';
    const n = (s) => equipes.filter((e) => e.situacao === s).length;
    return `<p class="op-frase">${n('livre')} ${n('livre') === 1 ? 'livre' : 'livres'} · ${n('deslocamento')} a caminho · ${n('no_local')} no local</p>
      <ul class="op-equipes">${equipes.map((e) => `<li>
        <div><b>${esc(e.nome)}</b> ${seloEquipe(e.situacao)}<small>${e.ocorrencia ? `${esc(e.ocorrencia.titulo)} · ${esc(bairro(e.ocorrencia.bairroId).nome)} · ${ha(e.desde)}` : 'Pronta para despachar'}</small></div>
        ${e.ocorrencia ? `<button type="button" class="alerta-ver" data-alerta="${esc(e.ocorrencia.id)}">Ver</button>` : ''}
      </li>`).join('')}</ul>`;
  };

  async function dadosDo(form) {
    const f = new FormData(form);
    const tipo = form.dataset.opTipo;
    if (tipo === 'resolver') return { texto: (f.get('texto') || '').toString(), foto: GC.reduzirFoto ? await GC.reduzirFoto(form.querySelector('input[type=file]').files[0]) : null };
    if (tipo === 'devolver') return { para: f.get('para') || '', motivo: (f.get('motivo') || '').toString() };
    if (tipo === 'juntar') return { principal: f.get('principal') || '' };
    if (tipo === 'delegar') return { usuarioId: f.get('usuarioId') || null };
    // Formulários de prazo (js/prazos-ui.js) e outros: os campos como vieram.
    return Object.fromEntries([...f.entries()].map(([k, v]) => [k, typeof v === 'string' ? v : null]));
  }

  // acoes: { executar(acao, oid, dados) → { ok, motivo }, aoConcluir?() }
  GC.ligarOperacao = function (raiz, acoes) {
    if (!raiz || raiz.dataset.opLigado) return;
    raiz.dataset.opLigado = '1';
    raiz.addEventListener('click', (e) => {
      const alvo = e.target.closest('[data-op], [data-op-form], [data-op-fechar]');
      if (!alvo || !raiz.contains(alvo)) return;
      e.stopPropagation();
      if (alvo.matches('[data-op]')) {
        const r = acoes.executar(alvo.dataset.op, alvo.dataset.opId, { equipeId: alvo.dataset.opEquipe }) || {};
        if (r.ok && acoes.aoConcluir) acoes.aoConcluir();
        return;
      }
      if (alvo.matches('[data-op-form]')) {
        const bloco = alvo.closest('[data-op-bloco]');
        bloco.querySelectorAll('.cb-form').forEach((f) => { f.hidden = f.dataset.opTipo !== alvo.dataset.opForm || !f.hidden; });
        const aberto = bloco.querySelector(`.cb-form[data-op-tipo="${alvo.dataset.opForm}"]:not([hidden])`);
        if (aberto) { const campo = aberto.querySelector('select, textarea, input'); if (campo) campo.focus(); }
        return;
      }
      alvo.closest('.cb-form').hidden = true;
    });
    raiz.addEventListener('submit', async (e) => {
      const form = e.target.closest('.cb-form[data-op-tipo]');
      if (!form) return;
      e.preventDefault();
      e.stopPropagation();
      const botao = form.querySelector('[type=submit]');
      botao.disabled = true;
      const r = acoes.executar(form.dataset.opTipo, form.dataset.opId, await dadosDo(form)) || { ok: false };
      botao.disabled = false;
      if (!r.ok) { form.querySelector('.cb-erro').textContent = GC.ERROS_OPERACAO[r.motivo] || 'Não deu certo. Tente de novo.'; return; }
      form.hidden = true;
      if (acoes.aoConcluir) acoes.aoConcluir();
    });
  };
})(window.GC = window.GC || {});
