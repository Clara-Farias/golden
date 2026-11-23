(function (GC) {
  // Tela "Minha conta" (#/conta): quem está usando o painel, acesso e segurança (senha e sessão), a aparência e a atividade recente.
  // Sem login (?login=1 ausente), mostra o usuário de demonstração do perfil e oferece entrar com um usuário.
  const esc = (t) => GC.escaparHtml(t);
  const diaHora = (t) => new Date(t).toLocaleString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  const hora = (t) => new Date(t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const chaveDia = (t) => new Date(t).toDateString();
  function duracao(min) {
    if (min < 60) return `${Math.max(1, Math.round(min))} min`;
    if (min < 48 * 60) return `${Math.round(min / 60)} h`;
    return `${Math.round(min / 1440)} dias`;
  }
  function rotuloDia(t, agora) {
    if (chaveDia(t) === chaveDia(agora)) return 'Hoje';
    if (chaveDia(t) === chaveDia(agora - 86400000)) return 'Ontem';
    return new Date(t).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' });
  }

  // Atividade por dia; a mesma ação seguida (ex.: várias entradas no painel) vira uma linha só, com a contagem.
  function agruparAtividade(lista, agora) {
    const dias = [];
    lista.forEach((e) => {
      const rot = rotuloDia(e.t, agora);
      let dia = dias[dias.length - 1];
      if (!dia || dia.rotulo !== rot) { dia = { rotulo: rot, itens: [] }; dias.push(dia); }
      const ult = dia.itens[dia.itens.length - 1];
      if (ult && ult.acao === e.acao && (ult.alvo || '') === (e.alvo || '')) ult.vezes += 1;
      else dia.itens.push({ acao: e.acao, alvo: e.alvo, t: e.t, vezes: 1 });
    });
    return dias;
  }

  // Força da senha nova: as regras obrigatórias mais comprimento e variedade.
  function forcaSenha(senha, u) {
    if (!senha) return null;
    const regras = GC.regrasSenha(senha, u);
    if (!regras.every((r) => r.ok)) return { nivel: 1, texto: 'Fraca' };
    const extra = (senha.length >= 12 ? 1 : 0) + (/[^a-zA-Z0-9À-ÿ]/.test(senha) || (/[a-zà-ÿ]/.test(senha) && /[A-ZÀ-Þ]/.test(senha)) ? 1 : 0);
    return extra >= 2 ? { nivel: 3, texto: 'Forte' } : { nivel: 2, texto: 'Boa' };
  }

  const campoSenha = (nome, rotulo, auto, extra = '') => `
    <label class="ct-campo">${rotulo}
      <span class="ct-senha-campo"><input type="password" name="${nome}" autocomplete="${auto}" required ${extra}>
        <button type="button" class="ct-olho" aria-pressed="false" aria-label="Mostrar a senha"><i class="ti ti-eye" aria-hidden="true"></i></button></span>
    </label>`;

  // opcoes: { aoTrocarSenha(atual, nova) -> resultado, aoSair(), aoEntrar(), aoVerAuditoria(), aoTema(tema) }
  GC.criarTelaConta = function (el, opcoes) {
    let estado = null;
    let assinatura = '';
    let senhaAberta = false;
    let avisoSenha = null; // { texto, tipo } mostrado na linha da senha depois de salvar

    function desenhar() {
      const { usuario: u, perfilRotulo, nomeArea, login, sessao, acessos, atividade, senhaTrocada, tema, agora } = estado;
      if (!u) { el.innerHTML = '<p class="ct-vazio">Nenhum usuário neste perfil.</p>'; return; }
      const anterior = acessos[1];
      const sessaoTexto = login && sessao
        ? `Entrou ${esc(diaHora(sessao.inicio))} · termina em ${esc(duracao((sessao.expira - agora) / 60000))}${sessao.manter ? ' · conectado neste navegador' : ''}`
        : 'Demonstração sem login: o painel abre direto no perfil escolhido.';
      const dias = agruparAtividade(atividade, agora);
      const opTema = (valor, nome, icone, dica) => `
        <label class="ct-tema-op${tema === valor ? ' sel' : ''}">
          <input type="radio" name="ct-tema" value="${valor}"${tema === valor ? ' checked' : ''}>
          <span class="ct-tema-ok" aria-hidden="true"><i class="ti ti-check"></i></span>
          <span class="ct-mini ct-mini-${valor}" aria-hidden="true"><i></i><b></b><b></b></span>
          <span class="ct-tema-txt"><b><i class="ti ti-${icone}" aria-hidden="true"></i> ${nome}</b><small>${dica}</small></span>
        </label>`;

      el.innerHTML = `
        <header class="sec-topo ct-topo"><div><h2><i class="ti ti-user-circle" aria-hidden="true"></i> Minha conta</h2><p>Seus dados de acesso, a senha e as preferências deste navegador.</p></div></header>

        <section class="rel-cartao ct-perfil" aria-label="Identificação">
          <span class="ct-avatar ct-avatar-g" aria-hidden="true">${esc(u.iniciais)}</span>
          <div class="ct-perfil-txt">
            <h3>${esc(u.nome)}</h3>
            <p>${esc(u.cargo)}</p>
            <ul class="ct-chips" aria-label="Acesso">
              <li><i class="ti ti-shield-check" aria-hidden="true"></i> ${esc(perfilRotulo)}</li>
              ${nomeArea && nomeArea !== u.cargo ? `<li><i class="ti ti-building" aria-hidden="true"></i> ${esc(nomeArea)}</li>` : ''}
              <li class="ct-chip-email"><i class="ti ti-mail" aria-hidden="true"></i> ${esc(u.email)}</li>
            </ul>
          </div>
        </section>

        <div class="ct-grade">
          <div class="ct-col">
            <section class="rel-cartao ct-seg" aria-labelledby="ct-seg-tit">
              <h3 id="ct-seg-tit">Acesso e segurança</h3>
              <div class="ct-item">
                <span class="ct-item-ic" aria-hidden="true"><i class="ti ti-key"></i></span>
                <div class="ct-item-txt"><b>Senha</b>
                  <span>${senhaTrocada ? 'Você já criou a sua senha.' : '<span class="ct-selo-aviso"><i class="ti ti-alert-triangle" aria-hidden="true"></i> Ainda é a senha de demonstração</span>'}</span></div>
                ${senhaAberta ? '' : '<button type="button" class="btn-sec ct-abrir-senha">Trocar senha</button>'}
              </div>
              ${avisoSenha && !senhaAberta ? `<p class="ct-msg ct-msg-${avisoSenha.tipo}" role="status">${avisoSenha.texto}</p>` : ''}
              ${senhaAberta ? `
              <form class="ct-form" novalidate aria-label="Trocar a senha">
                ${campoSenha('atual', 'Senha atual', 'current-password')}
                ${campoSenha('nova', 'Senha nova', 'new-password', 'aria-describedby="ct-forca ct-regras"')}
                <div class="ct-forca" id="ct-forca" hidden><span class="ct-forca-barra"><i></i><i></i><i></i></span><span class="ct-forca-txt"></span></div>
                <ul id="ct-regras" class="ct-regras" aria-live="polite" hidden></ul>
                ${campoSenha('conf', 'Repita a senha nova', 'new-password', 'aria-describedby="ct-confere"')}
                <p class="ct-confere" id="ct-confere" aria-live="polite"></p>
                <p class="ct-msg" role="status" hidden></p>
                <div class="ct-form-acoes">
                  <button type="button" class="btn-sec ct-cancelar">Cancelar</button>
                  <button type="submit" class="btn-primario ct-salvar">Salvar senha nova</button>
                </div>
              </form>` : ''}
              <div class="ct-item">
                <span class="ct-item-ic" aria-hidden="true"><i class="ti ti-device-desktop"></i></span>
                <div class="ct-item-txt"><b>Sessão neste navegador</b><span>${sessaoTexto}</span>
                  ${login ? `<span class="ct-item-sub">Acesso anterior: ${anterior ? esc(diaHora(anterior)) : 'primeiro acesso neste navegador'}</span>` : '<span class="ct-item-sub">Com "Entrar com usuário", o painel passa a pedir e-mail e senha.</span>'}</div>
                ${login
                  ? '<button type="button" class="btn-sec ct-sair"><i class="ti ti-logout" aria-hidden="true"></i> Sair</button>'
                  : '<button type="button" class="btn-sec ct-entrar"><i class="ti ti-login-2" aria-hidden="true"></i> Entrar com usuário</button>'}
              </div>
            </section>

            <section class="rel-cartao ct-pref" aria-labelledby="ct-pref-tit">
              <h3 id="ct-pref-tit">Aparência</h3>
              <fieldset class="ct-tema"><legend class="so-leitor">Tema</legend>
                ${opTema('claro', 'Claro', 'sun', 'Para o dia a dia')}
                ${opTema('escuro', 'Noturno', 'moon', 'Sala de crise e uso à noite')}
              </fieldset>
              <p class="ct-sub ct-pref-pe"><span>Vale para este navegador. O botão de tema do mapa faz a mesma troca.</span>
                <a class="ct-link" href="#/personalizar">Mais opções de aparência <i class="ti ti-arrow-right" aria-hidden="true"></i></a></p>
            </section>
          </div>

          <div class="ct-col">
            <section class="rel-cartao ct-ativ" aria-labelledby="ct-ativ-tit">
              <div class="ct-ativ-cab"><h3 id="ct-ativ-tit">Sua atividade recente</h3>
                <button type="button" class="ct-link ct-auditoria">Ver na auditoria <i class="ti ti-arrow-right" aria-hidden="true"></i></button></div>
              ${dias.length ? dias.map((d) => `
                <h4 class="ct-dia">${esc(d.rotulo)}</h4>
                <ol class="ct-lista">${d.itens.map((e) => {
                  const a = GC.ACOES_AUDITORIA[e.acao] || { nome: e.acao, icone: 'point' };
                  return `<li class="${a.atencao ? 'ct-atencao' : ''}"><i class="ti ti-${a.icone}" aria-hidden="true"></i><span><b>${esc(a.nome)}</b>${e.vezes > 1 ? ` <span class="ct-vezes">${e.vezes} vezes</span>` : ''}${e.alvo ? ` <span class="ct-alvo">${esc(e.alvo)}</span>` : ''}</span><time datetime="${new Date(e.t).toISOString()}" title="${esc(diaHora(e.t))}">${esc(hora(e.t))}</time></li>`;
                }).join('')}</ol>`).join('') : '<p class="ct-sub">Nada registrado ainda.</p>'}
            </section>
          </div>
        </div>`;

      const liga = (sel, fn) => { const b = el.querySelector(sel); if (b) b.onclick = fn; };
      liga('.ct-sair', () => opcoes.aoSair());
      liga('.ct-entrar', () => opcoes.aoEntrar());
      liga('.ct-auditoria', () => opcoes.aoVerAuditoria());
      liga('.ct-abrir-senha', () => { senhaAberta = true; avisoSenha = null; desenhar(); el.querySelector('.ct-form input[name="atual"]').focus(); });
      el.querySelectorAll('input[name="ct-tema"]').forEach((r) => { r.onchange = () => opcoes.aoTema(r.value); });

      const form = el.querySelector('.ct-form');
      if (form) ligarFormulario(form, u);
    }

    function ligarFormulario(form, u) {
      const fechar = () => { senhaAberta = false; desenhar(); const b = el.querySelector('.ct-abrir-senha'); if (b) b.focus(); };
      form.querySelectorAll('.ct-olho').forEach((b) => {
        b.onclick = () => {
          const input = b.parentElement.querySelector('input');
          const ver = input.type === 'password';
          input.type = ver ? 'text' : 'password';
          b.setAttribute('aria-pressed', String(ver));
          b.setAttribute('aria-label', ver ? 'Esconder a senha' : 'Mostrar a senha');
          b.innerHTML = `<i class="ti ti-${ver ? 'eye-off' : 'eye'}" aria-hidden="true"></i>`;
        };
      });
      const lista = form.querySelector('#ct-regras');
      const forca = form.querySelector('#ct-forca');
      const confere = form.querySelector('#ct-confere');
      const atualizar = () => {
        const v = form.nova.value;
        const mostrar = !!v || document.activeElement === form.nova;
        lista.hidden = !mostrar;
        lista.innerHTML = GC.regrasSenha(v, u).map((r) => `<li class="${r.ok ? 'ok' : ''}"><i class="ti ti-${r.ok ? 'circle-check' : 'circle-dashed'}" aria-hidden="true"></i> ${esc(r.texto)}<span class="so-leitor">${r.ok ? ': atendida' : ': falta'}</span></li>`).join('');
        const f = forcaSenha(v, u);
        forca.hidden = !f;
        if (f) { forca.dataset.nivel = f.nivel; forca.querySelector('.ct-forca-txt').textContent = `Senha ${f.texto.toLowerCase()}`; }
        const c = form.conf.value;
        confere.className = `ct-confere${c ? (c === v ? ' ok' : ' nao') : ''}`;
        confere.innerHTML = !c ? '' : c === v
          ? '<i class="ti ti-circle-check" aria-hidden="true"></i> As duas senhas conferem'
          : '<i class="ti ti-alert-circle" aria-hidden="true"></i> Ainda diferentes da senha nova';
      };
      atualizar();
      form.nova.oninput = atualizar;
      form.conf.oninput = atualizar;
      form.nova.onfocus = atualizar;
      form.nova.onblur = atualizar;
      form.querySelector('.ct-cancelar').onclick = fechar;
      form.onkeydown = (ev) => { if (ev.key === 'Escape') { ev.stopPropagation(); fechar(); } };
      const msg = (texto, tipo) => {
        const p = form.querySelector('.ct-msg');
        p.className = `ct-msg ct-msg-${tipo}`;
        p.innerHTML = texto;
        p.hidden = !texto;
      };
      form.onsubmit = (ev) => {
        ev.preventDefault();
        if (!form.atual.value) { msg('Digite a senha atual.', 'erro'); form.atual.focus(); return; }
        if (!GC.senhaValida(form.nova.value, u)) { msg('A senha nova ainda não atende a todas as regras.', 'erro'); form.nova.focus(); return; }
        if (form.nova.value !== form.conf.value) { msg('As duas senhas novas não são iguais.', 'erro'); form.conf.focus(); return; }
        const r = opcoes.aoTrocarSenha(form.atual.value, form.nova.value);
        if (r.ok) {
          avisoSenha = { tipo: 'ok', texto: '<i class="ti ti-circle-check" aria-hidden="true"></i> Senha trocada. Use a nova na próxima entrada.' };
          fechar();
          return;
        }
        const textos = { atual: 'A senha atual não confere.', igual: 'A senha nova é igual à atual.', senha: 'A senha nova ainda não atende a todas as regras.' };
        msg(textos[r.motivo] || 'Não foi possível trocar a senha.', 'erro');
        (r.motivo === 'atual' ? form.atual : form.nova).select();
      };
    }

    // Redesenha só quando algo visível mudou (a troca de senha não pode perder o que está sendo digitado).
    const assinar = (e) => JSON.stringify([e.usuario && e.usuario.id, e.tema, e.senhaTrocada, e.atividade.map((x) => x.id), e.sessao && e.sessao.inicio]);
    return {
      mostrar(e) {
        const outro = !estado || !estado.usuario || !e.usuario || estado.usuario.id !== e.usuario.id;
        if (outro) { senhaAberta = false; avisoSenha = null; }
        estado = e; assinatura = assinar(e); desenhar();
      },
      atualizar(e) {
        const nova = assinar(e);
        estado = e;
        if (nova === assinatura) return;
        assinatura = nova;
        const digitando = el.contains(document.activeElement) && document.activeElement.matches('.ct-form input');
        if (!digitando) desenhar();
      },
    };
  };
})(window.GC = window.GC || {});
