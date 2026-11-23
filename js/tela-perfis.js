(function (GC) {
  // Aba "Perfis de acesso" da tela Usuários (#/usuarios/perfis, #/usuarios/perfis/<id>, #/usuarios/perfis/novo/<base>).
  // Lista os perfis (os do sistema e os criados), abre um para ver ou editar e cria um novo a partir de outro.
  // Os do sistema também se editam (menos a visão) e voltam ao padrão de fábrica; o gestor geral não perde
  // GC.PERMISSOES_ESSENCIAIS. Quem não tem 'perfis.gerir' só vê.
  // As regras (quem pode, o que cabe em cada visão, perfil em uso) estão em js/perfis-acesso.js e js/permissoes.js;
  // a tela só mostra e devolve o que foi pedido. Estilo em css/perfis-acesso.css.
  const esc = (t) => GC.escaparHtml(t);
  const VISOES = {
    cidade: { nome: 'Cidade toda', icone: 'building-community', explica: 'Painel inteiro, todas as secretarias. É o lado de quem cobra e decide.' },
    pasta: { nome: 'Uma secretaria', icone: 'building', explica: 'Painel recortado na secretaria da pessoa. É o lado de quem responde e opera.' },
  };
  const ICONE_EXIBICAO = { completa: 'layout-grid', resumida: 'layout-list', so_resumida: 'lock' };
  const ALCANCE_NOME = { cidade: 'Toda a cidade', pasta: 'Toda a pasta', delegadas: 'Só o delegado à pessoa' };
  const MOTIVOS = {
    permissao: 'O seu perfil não permite mexer em perfis de acesso.',
    'em-uso': 'Há pessoas com este perfil. Mude o perfil delas em Pessoas antes de excluir.',
    'visao-em-uso': 'Há pessoas com este perfil: a visão não muda (elas ficariam sem secretaria, ou com uma sobrando).',
    'nao-existe': 'Este perfil não existe mais.',
    'visao-sistema': 'A visão de um perfil do sistema não muda. Para outra visão, duplique o perfil.',
    sistema: 'Perfil do sistema não se exclui. Dá para voltar ao padrão de fábrica.',
  };
  const quando = (t) => new Date(t).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

  // opcoes: { aoIr(rota), aoCriar(d), aoEditar(id, d), aoExcluir(id), aoRestaurar(id) }; cada ação devolve o resultado de
  // js/perfis-acesso.js ({ ok, motivo, erros, perfil }).
  GC.criarPainelPerfis = function (opcoes) {
    let el = null;
    let estado = null;
    let rascunho = null; // o que está no editor (sobrevive a um redesenho por outra aba)
    let aviso = '';

    const papel = (id) => GC.papelPorId(id);
    const emUso = (id) => estado.emUso[id] || 0;

    function desenhar() {
      const r = estado.rota || {};
      if (r.perfil === 'novo') return editor(null, papel(r.base) || papel('secretario'));
      if (r.perfil) {
        const x = papel(r.perfil);
        if (x && x.pagina === 'painel') return editor(x, null);
        aviso = MOTIVOS['nao-existe'];
      }
      rascunho = null;
      lista();
    }

    // ---- lista ----
    function cartao(x) {
      const n = Object.keys(x.permissoes).length;
      const v = VISOES[x.visao];
      const uso = emUso(x.id);
      const verComo = GC.urlVerComo ? GC.urlVerComo(x.id) : null;
      const chip = !x.sistema ? '<span class="us-chip us-chip-ok">Criado</span>'
        : x.alterado ? '<span class="us-chip us-chip-pendente" title="Ajustado; dá para voltar ao padrão de fábrica">Do sistema · ajustado</span>'
          : '<span class="us-chip us-chip-off">Do sistema</span>';
      return `<article class="pf-cartao${x.sistema ? '' : ' pf-criado'}${x.alterado ? ' pf-ajustado' : ''}">
        <div class="pf-cartao-topo"><h3><a href="#/usuarios/perfis/${esc(encodeURIComponent(x.id))}" data-abrir="${esc(x.id)}">${esc(x.nome)}</a></h3>${chip}</div>
        <p class="pf-visao"><i class="ti ti-${v.icone}" aria-hidden="true"></i> ${esc(v.nome)}${GC.EXIBICOES[x.exibicao] ? ` <span class="pf-exibicao" title="${esc(GC.EXIBICOES[x.exibicao].explica)}"><i class="ti ti-${ICONE_EXIBICAO[x.exibicao]}" aria-hidden="true"></i> Visão ${esc(GC.EXIBICOES[x.exibicao].nome.toLowerCase())}</span>` : ''}</p>
        ${x.descricao ? `<p class="pf-desc">${esc(x.descricao)}</p>` : ''}
        <p class="pf-numeros">${plural(n, 'permissão', 'permissões')} · ${plural(uso, 'pessoa', 'pessoas')}</p>
        <div class="pf-cartao-pe">
          <button type="button" class="us-acao" data-abrir="${esc(x.id)}"><i class="ti ti-${!estado.podeGerir ? 'eye' : 'pencil'}" aria-hidden="true"></i> ${!estado.podeGerir ? 'Ver' : 'Editar'}</button>
          ${estado.podeGerir ? `<button type="button" class="us-acao" data-duplicar="${esc(x.id)}"><i class="ti ti-copy" aria-hidden="true"></i> Duplicar</button>` : ''}
          ${verComo ? `<a class="us-acao" href="${esc(verComo)}" target="_blank" rel="noopener" title="Abre o painel numa aba nova, como alguém com este perfil"><i class="ti ti-external-link" aria-hidden="true"></i> Ver o painel como</a>` : ''}
          ${!x.sistema && estado.podeGerir ? `<button type="button" class="us-acao us-acao-perigo" data-excluir="${esc(x.id)}" ${uso ? `disabled title="${esc(MOTIVOS['em-uso'])}"` : ''}><i class="ti ti-trash" aria-hidden="true"></i> Excluir</button>` : ''}
        </div>
      </article>`;
    }

    function lista() {
      const todos = GC.perfisAcesso.lista();
      const sistema = todos.filter((x) => x.sistema);
      const criados = todos.filter((x) => !x.sistema);
      el.innerHTML = `
        <p class="us-aviso${aviso ? ' us-aviso-erro' : ''}" role="status" ${aviso ? '' : 'hidden'}>${esc(aviso)}</p>
        <section class="rel-cartao pf-bloco">
          <div class="pf-bloco-cab"><div><h3>Perfis do sistema</h3>
            <p class="us-fixo">${estado.podeGerir ? 'Vêm prontos. Dá para ajustar nome, descrição, como o painel abre e as permissões (o que a pessoa enxerga fica) e voltar ao padrão de fábrica quando quiser.' : 'Os perfis que vêm prontos. Só o gestor geral muda.'}</p></div>
            ${estado.podeGerir ? '<button type="button" class="btn-primario pf-novo"><i class="ti ti-shield-plus" aria-hidden="true"></i> Novo perfil</button>' : ''}</div>
          <div class="pf-grade">${sistema.map(cartao).join('')}</div>
        </section>
        <section class="rel-cartao pf-bloco">
          <div class="pf-bloco-cab"><div><h3>Perfis criados</h3>
            <p class="us-fixo">Para um conjunto próprio de permissões: comece de um perfil parecido (Duplicar) e ajuste.</p></div></div>
          ${criados.length ? `<div class="pf-grade">${criados.map(cartao).join('')}</div>`
            : `<p class="au-vazio"><i class="ti ti-shield" aria-hidden="true"></i> Nenhum perfil criado ainda.${estado.podeGerir ? ' Use Duplicar num perfil acima ou Novo perfil.' : ''}</p>`}
        </section>
        <p class="pf-nota"><i class="ti ti-info-circle" aria-hidden="true"></i> Mudanças valem na hora para quem tem o perfil. Nesta demonstração, ficam guardadas neste navegador.</p>`;
      aviso = '';
      el.querySelectorAll('[data-abrir]').forEach((b) => { b.onclick = (ev) => { ev.preventDefault(); opcoes.aoIr({ perfil: b.dataset.abrir }); }; });
      el.querySelectorAll('[data-duplicar]').forEach((b) => { b.onclick = () => opcoes.aoIr({ perfil: 'novo', base: b.dataset.duplicar }); });
      el.querySelectorAll('[data-excluir]').forEach((b) => {
        const x = papel(b.dataset.excluir);
        b.onclick = () => x && confirmar({
          titulo: `Excluir o perfil ${x.nome}?`,
          texto: 'O perfil some da lista e não dá para desfazer. A exclusão fica registrada na auditoria.',
          botao: 'Excluir',
          perigo: true,
          acao: () => opcoes.aoExcluir(x.id),
        });
      });
      const novo = el.querySelector('.pf-novo');
      if (novo) novo.onclick = () => opcoes.aoIr({ perfil: 'novo', base: 'secretario' });
    }

    // ---- editor ----
    // x: o perfil aberto (null = novo); base: de onde o novo começa.
    function editor(x, base) {
      const novo = !x;
      const chave = novo ? `novo:${base.id}` : x.id;
      if (!rascunho || rascunho.chave !== chave) {
        const de = x || base;
        rascunho = {
          chave,
          nome: novo ? `${base.nome} (cópia)` : x.nome,
          descricao: novo ? (base.descricao || '') : x.descricao || '',
          visao: de.visao,
          exibicao: de.exibicao || 'completa',
          permissoes: Object.assign({}, de.permissoes),
          comparar: novo ? base.id : '',
        };
      }
      const so = !estado.podeGerir;
      const doSistema = !!(x && x.sistema);
      const uso = x ? emUso(x.id) : 0;
      const travaVisao = so || doSistema || uso > 0;
      const titulo = novo ? 'Novo perfil de acesso' : so ? x.nome : `Editar ${x.nome}`;
      const sub = novo ? `Começa como uma cópia de <b>${esc(base.nome)}</b>.`
        : so ? (doSistema ? 'Perfil do sistema. Só o gestor geral muda.' : 'Só o gestor geral muda este perfil.')
          : `${doSistema ? 'Perfil do sistema. ' : ''}${plural(uso, 'pessoa usa', 'pessoas usam')} este perfil; as mudanças valem na hora para elas.`;
      const outros = GC.perfisAcesso.lista().filter((p) => !x || p.id !== x.id);
      el.innerHTML = `
        <p class="pf-voltar"><a href="#/usuarios/perfis" data-voltar><i class="ti ti-arrow-left" aria-hidden="true"></i> Perfis de acesso</a></p>
        <form class="rel-cartao pf-editor" novalidate>
          <div class="pf-bloco-cab"><div><h3>${esc(titulo)}</h3>
            <p class="us-fixo">${sub}</p></div>
            ${x && GC.urlVerComo && GC.urlVerComo(x.id) ? `<a class="us-acao" href="${esc(GC.urlVerComo(x.id))}" target="_blank" rel="noopener"><i class="ti ti-external-link" aria-hidden="true"></i> Ver o painel como</a>` : ''}</div>
          ${so ? '' : `
          <label class="ct-campo">Nome<input name="nome" maxlength="60" autocomplete="off" value="${esc(rascunho.nome)}" required></label>
          <p class="us-erro" data-erro="nome" hidden></p>
          <label class="ct-campo">Para quem é <small>(opcional)</small><textarea name="descricao" maxlength="200" rows="2" placeholder="Ex.: Coordenadores de unidade de saúde">${esc(rascunho.descricao)}</textarea></label>
          <p class="us-erro" data-erro="descricao" hidden></p>`}
          <fieldset class="pf-visoes"${travaVisao ? ' disabled' : ''}><legend>O que a pessoa enxerga</legend>
            ${Object.entries(VISOES).map(([id, v]) => `<label class="pf-visao-op"><input type="radio" name="visao" value="${id}"${rascunho.visao === id ? ' checked' : ''}>
              <span><b><i class="ti ti-${v.icone}" aria-hidden="true"></i> ${esc(v.nome)}</b><small>${esc(v.explica)}</small></span></label>`).join('')}
          </fieldset>
          ${!so && doSistema ? `<p class="us-fixo"><i class="ti ti-lock" aria-hidden="true"></i> ${esc(MOTIVOS['visao-sistema'])}</p>`
            : !so && uso > 0 ? `<p class="us-fixo"><i class="ti ti-lock" aria-hidden="true"></i> ${esc(MOTIVOS['visao-em-uso'])}</p>` : ''}
          ${doSistema && x.alterado ? `<div class="pf-ajustado-aviso"><i class="ti ti-adjustments" aria-hidden="true"></i><span>Ajustado${x.atualizadoEm ? ` em ${esc(quando(x.atualizadoEm))}` : ''}. O padrão de fábrica continua guardado.</span>${so ? '' : '<button type="button" class="us-acao pf-restaurar"><i class="ti ti-restore" aria-hidden="true"></i> Voltar ao padrão</button>'}</div>` : ''}
          <p class="us-erro" data-erro="visao" hidden></p>
          <fieldset class="pf-visoes pf-exibicoes"${so ? ' disabled' : ''}><legend>Como o painel abre</legend>
            ${Object.entries(GC.EXIBICOES).map(([id, e]) => `<label class="pf-visao-op"><input type="radio" name="exibicao" value="${id}"${rascunho.exibicao === id ? ' checked' : ''}${x && x.id === 'gestor_geral' && id === 'so_resumida' ? ' disabled' : ''}>
              <span><b><i class="ti ti-${ICONE_EXIBICAO[id]}" aria-hidden="true"></i> ${esc(e.nome)}</b><small>${esc(e.explica)}</small></span></label>`).join('')}
          </fieldset>
          <p class="us-erro" data-erro="exibicao" hidden></p>
          <div class="pf-comparar"><label>Comparar com <select name="comparar"><option value="">Nenhum</option>${outros.map((p) => `<option value="${esc(p.id)}"${rascunho.comparar === p.id ? ' selected' : ''}>${esc(p.nome)}</option>`).join('')}</select></label>
            <span class="pf-legenda" hidden><span class="pf-marca pf-marca-mais">a mais</span> <span class="pf-marca pf-marca-menos">a menos</span> <span class="pf-marca pf-marca-outro">outro alcance</span></span></div>
          <div class="pf-permissoes"></div>
          <p class="us-erro" data-erro="permissoes" hidden></p>
          <p class="us-erro" data-erro="geral" hidden></p>
          <div class="cr-dialogo-botoes">
            ${so ? '' : `${x ? '<button type="button" class="btn-sec pf-duplicar"><i class="ti ti-copy" aria-hidden="true"></i> Duplicar</button>' : ''}<span class="pf-espaco"></span><button type="button" class="btn-sec pf-cancelar">Cancelar</button><button type="submit" class="btn-primario">${novo ? 'Criar perfil' : 'Salvar'}</button>`}
          </div>
        </form>`;
      const form = el.querySelector('form');
      desenharPermissoes(form, so);
      el.querySelector('[data-voltar]').onclick = (ev) => { ev.preventDefault(); rascunho = null; opcoes.aoIr({ perfil: null }); };
      form.querySelectorAll('[name="visao"]').forEach((r) => {
        r.onchange = () => {
          rascunho.visao = r.value;
          // O que não cabe na visão nova cai fora; o que cabe com outro alcance fica com o primeiro permitido.
          const o = {};
          Object.entries(rascunho.permissoes).forEach(([k, a]) => { const ok = GC.alcancesPermitidos(r.value, k); if (ok.length) o[k] = ok.includes(a) ? a : ok[0]; });
          rascunho.permissoes = o;
          desenharPermissoes(form, so);
        };
      });
      form.querySelectorAll('[name="exibicao"]').forEach((r) => { r.onchange = () => { rascunho.exibicao = r.value; }; });
      form.comparar.onchange = () => { rascunho.comparar = form.comparar.value; desenharPermissoes(form, so); };
      if (form.nome) form.nome.oninput = () => { rascunho.nome = form.nome.value; };
      if (form.descricao) form.descricao.oninput = () => { rascunho.descricao = form.descricao.value; };
      const cancelar = form.querySelector('.pf-cancelar');
      if (cancelar) cancelar.onclick = () => { rascunho = null; opcoes.aoIr({ perfil: null }); };
      const duplicar = form.querySelector('.pf-duplicar');
      if (duplicar) duplicar.onclick = () => { rascunho = null; opcoes.aoIr({ perfil: 'novo', base: x.id }); };
      const restaurar = form.querySelector('.pf-restaurar');
      if (restaurar) restaurar.onclick = () => confirmar({
        titulo: `Voltar ${x.nome} ao padrão?`,
        texto: 'Nome, descrição, a forma como o painel abre e as permissões voltam aos de fábrica, para todas as pessoas com este perfil. A mudança fica registrada na auditoria.',
        botao: 'Voltar ao padrão',
        acao: () => opcoes.aoRestaurar(x.id),
        depois: () => { rascunho = null; desenhar(); },
      });
      form.onsubmit = (ev) => {
        ev.preventDefault();
        if (so) return;
        const d = { nome: rascunho.nome, descricao: rascunho.descricao, exibicao: rascunho.exibicao, permissoes: rascunho.permissoes };
        if (!doSistema) d.visao = rascunho.visao;
        const r = novo ? opcoes.aoCriar(Object.assign(d, { base: base.id })) : opcoes.aoEditar(x.id, d);
        form.querySelectorAll('.us-erro').forEach((p) => { p.hidden = true; });
        if (!r.ok) {
          const erros = r.erros || { geral: MOTIVOS[r.motivo] || 'Não foi possível salvar.' };
          Object.entries(erros).forEach(([k, msg]) => { const p = form.querySelector(`[data-erro="${k}"]`) || form.querySelector('[data-erro="geral"]'); p.textContent = msg; p.hidden = false; });
          const primeiro = form.querySelector(`[name="${Object.keys(erros)[0]}"]`);
          if (primeiro) primeiro.focus();
          return;
        }
        aviso = '';
        rascunho = null;
        opcoes.aoIr({ perfil: null });
      };
    }

    // Permissões da visão, por grupo: caixa para marcar e, quando há mais de um, o alcance.
    function desenharPermissoes(form, so) {
      const caixa = form.querySelector('.pf-permissoes');
      const chaves = GC.chavesDaVisao(rascunho.visao);
      const outro = rascunho.comparar ? papel(rascunho.comparar) : null;
      const travadas = rascunho.chave === 'gestor_geral' ? GC.PERMISSOES_ESSENCIAIS : [];
      form.querySelector('.pf-legenda').hidden = !outro;
      const grupos = [];
      GC.PERMISSOES.filter((p) => chaves.includes(p.id)).forEach((p) => {
        let g = grupos.find((x) => x.nome === p.grupo);
        if (!g) { g = { nome: p.grupo, itens: [] }; grupos.push(g); }
        g.itens.push(p);
      });
      const marcados = Object.keys(rascunho.permissoes).length;
      caixa.innerHTML = `<p class="pf-conta">${plural(marcados, 'permissão marcada', 'permissões marcadas')} de ${chaves.length} possíveis nesta visão.</p>
        ${grupos.map((g) => {
          const noGrupo = g.itens.filter((p) => rascunho.permissoes[p.id]).length;
          return `<fieldset class="pf-grupo"${so ? ' disabled' : ''}><legend>${esc(g.nome)} <small>${noGrupo} de ${g.itens.length}</small></legend>
            ${g.itens.map((p) => {
              const alcance = rascunho.permissoes[p.id] || null;
              const ok = GC.alcancesPermitidos(rascunho.visao, p.id);
              const dele = outro ? outro.permissoes[p.id] || null : alcance;
              const dif = !outro || dele === alcance ? '' : !dele ? ' pf-mais' : !alcance ? ' pf-menos' : ' pf-outro';
              const rotDif = { ' pf-mais': `${outro && outro.nome} não tem`, ' pf-menos': `${outro && outro.nome} tem`, ' pf-outro': `${outro && outro.nome}: ${ALCANCE_NOME[dele] || ''}` }[dif] || '';
              return `<div class="pf-linha${dif}">
                <label${travadas.includes(p.id) ? ' title="O gestor geral sempre tem esta permissão: sem ela, ninguém mexeria de novo em perfis e usuários."' : ''}><input type="checkbox" data-chave="${esc(p.id)}"${alcance ? ' checked' : ''}${travadas.includes(p.id) ? ' disabled' : ''}> <span>${esc(p.nome)}${travadas.includes(p.id) ? ' <i class="ti ti-lock pf-trava" aria-label="obrigatória"></i>' : ''}</span></label>
                ${ok.length > 1 ? `<select data-alcance="${esc(p.id)}" aria-label="Alcance de ${esc(p.nome)}"${alcance ? '' : ' disabled'}>${ok.map((a) => `<option value="${a}"${(alcance || ok[0]) === a ? ' selected' : ''}>${esc(ALCANCE_NOME[a])}</option>`).join('')}</select>`
                  : `<span class="pf-alcance">${esc(ALCANCE_NOME[ok[0]])}</span>`}
                ${rotDif ? `<small class="pf-dif">${esc(rotDif)}</small>` : ''}
              </div>`;
            }).join('')}
          </fieldset>`;
        }).join('')}`;
      caixa.querySelectorAll('[data-chave]').forEach((c) => {
        c.onchange = () => {
          const k = c.dataset.chave;
          const sel = caixa.querySelector(`[data-alcance="${k}"]`);
          if (c.checked) rascunho.permissoes[k] = sel ? sel.value : GC.alcancesPermitidos(rascunho.visao, k)[0];
          else delete rascunho.permissoes[k];
          desenharPermissoes(form, so);
          const de = caixa.querySelector(`[data-chave="${k}"]`);
          if (de) de.focus();
        };
      });
      caixa.querySelectorAll('[data-alcance]').forEach((s) => { s.onchange = () => { rascunho.permissoes[s.dataset.alcance] = s.value; desenharPermissoes(form, so); }; });
    }

    // Janela de confirmação: { titulo, texto, botao, perigo, acao() → resultado, depois() }.
    function confirmar({ titulo, texto, botao, perigo, acao, depois }) {
      const dlg = document.createElement('dialog');
      dlg.className = 'cr-dialogo us-dialogo';
      dlg.innerHTML = `<form method="dialog" class="cr-dialogo-form">
        <h3>${esc(titulo)}</h3>
        <p class="cr-dialogo-sub">${esc(texto)}</p>
        <p class="us-erro" data-erro="geral" hidden></p>
        <div class="cr-dialogo-botoes"><button type="submit" value="voltar" class="btn-sec">Cancelar</button><button type="submit" value="ok" class="btn-primario${perigo ? ' us-btn-perigo' : ''}">${esc(botao)}</button></div></form>`;
      document.body.appendChild(dlg);
      const form = dlg.querySelector('form');
      form.addEventListener('submit', (ev) => {
        ev.preventDefault();
        if (!ev.submitter || ev.submitter.value !== 'ok') { dlg.close(); return; }
        const r = acao();
        if (!r.ok) { const p = form.querySelector('[data-erro="geral"]'); p.textContent = MOTIVOS[r.motivo] || 'Não foi possível concluir.'; p.hidden = false; return; }
        dlg.close();
        if (depois) depois();
      });
      dlg.addEventListener('close', () => dlg.remove());
      dlg.showModal();
    }

    return {
      // e: { rota: { perfil, base }, podeGerir, emUso: { papelId: n } }
      mostrar(alvo, e) { el = alvo; estado = e; desenhar(); },
    };
  };
})(window.GC = window.GC || {});
