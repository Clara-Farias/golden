(function (GC) {
  // Peças de tela das tarefas (js/tarefas.js): o cartão de uma tarefa, o formulário "Passar tarefa" e o bloco
  // "Tarefas" que aparece no detalhe do alerta (js/gaveta.js) e no da temporada (js/tela-sazonal.js). A tela
  // #/tarefas (js/tela-tarefas.js) usa as mesmas peças. Os cliques são ligados uma vez por raiz (GC.ligarTarefas)
  // e a ação vai a GC.agirNaTarefa (js/app/telas.js), que confere a permissão, audita e põe o "Desfazer".
  // Os formulários usam .cb-form (css/cobrancas.css): o detalhe do alerta não se redesenha com um deles aberto.
  const esc = (t) => (GC.escaparHtml ? GC.escaparHtml(t) : String(t == null ? '' : t));
  const ic = (nome, cls) => (GC.icone ? GC.icone(nome, cls) : '');
  const MIN = 60000;
  const agora = () => (GC.agora ? GC.agora() : Date.now());
  const nomeArea = (id) => ((GC.data.areas || []).find((a) => a.id === id) || { nome: id }).nome;
  const nomeBairroTf = (id) => (id ? ((GC.data.bairros || []).find((b) => b.id === id) || { nome: '' }).nome : '');
  const nomeUsuario = (id) => { const u = id && GC.buscarUsuario ? GC.buscarUsuario(id) : null; return u ? u.nome : ''; };
  const dataCurta = (ms) => new Date(ms).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  const pode = (acao, t) => (GC.podeNaTarefa ? GC.podeNaTarefa(acao, t) : false);

  // Chip do contexto: leva até a temporada, o alerta ou o gabinete.
  GC.htmlContextoTarefa = function (c) {
    const def = GC.CONTEXTOS_TAREFA[c.tipo] || GC.CONTEXTOS_TAREFA.avulsa;
    if (c.tipo === 'avulsa') return `<span class="tf-ctx avulsa">${ic(def.icone)} Avulsa</span>`;
    return `<button type="button" class="tf-ctx ${c.tipo}" data-tf-ctx="${esc(c.tipo)}" data-tf-ctx-id="${esc(c.id)}" title="Abrir: ${esc(c.nome)}">${ic(def.icone)} ${esc(def.nome)}: ${esc(c.nome)}</button>`;
  };

  // Urgência pelo prazo: 'atrasada', 'hoje' (vence até o fim do dia), 'semana' (7 dias), 'depois' ou null
  // (feita ou cancelada). A tela #/demandas agrupa por ela e o selo de prazo do cartão usa a mesma cor.
  const DIA = 1440 * MIN;
  GC.urgenciaTarefa = function (t, em = agora()) {
    if (!GC.tarefaAberta(t)) return null;
    if (em > t.prazoEm) return 'atrasada';
    const fim = new Date(em);
    fim.setHours(23, 59, 59, 999);
    if (t.prazoEm <= fim.getTime()) return 'hoje';
    return t.prazoEm < em + 7 * DIA ? 'semana' : 'depois';
  };

  // ---------- Cartão ----------
  // opcoes: { comContexto (mostra o chip; no bloco do próprio contexto, não), aberto (histórico à vista) }
  GC.htmlCartaoTarefa = function (t, opcoes = {}) {
    const atrasada = GC.tarefaAtrasada(t);
    const situacao = t.respostaPendente ? 'cobrada' : atrasada ? 'atrasada' : t.status;
    const rotuloSit = t.respostaPendente ? 'Cobrada: falta responder' : atrasada ? 'Atrasada' : GC.STATUS_TAREFA[t.status];
    const quem = t.responsavelId ? nomeUsuario(t.responsavelId) : nomeArea(t.area);
    const gab = t.origem === 'gabinete';
    const urg = GC.urgenciaTarefa(t);
    const botoes = [];
    const mais = [];
    if (gab) botoes.push(`<button type="button" class="btn-sec" data-tf-ctx="gabinete" data-tf-ctx-id="${esc(t.gabineteId)}">${ic('door-enter')} Fazer na sala</button>`);
    else {
      // À vista, o que a pessoa faz agora (responder, concluir, começar, cobrar); mudar prazo e cancelar no "⋯".
      if (t.respostaPendente && pode('responder', t)) botoes.push(`<button type="button" class="btn-acao principal" data-tf-form="responder" aria-expanded="false">${ic('message-reply')} Responder cobrança</button>`);
      if (GC.tarefaAberta(t) && pode('concluir', t)) botoes.push(`<button type="button" class="${t.respostaPendente ? 'btn-sec' : 'btn-acao principal'}" data-tf-form="concluir" aria-expanded="false">${ic('check')} Concluir</button>`);
      if (t.status === 'a_fazer' && pode('iniciar', t)) botoes.push(`<button type="button" class="btn-sec" data-tf="iniciar" data-tf-id="${esc(t.id)}">${ic('player-play')} Começar</button>`);
      // Dúvida de quem faz (portal do servidor): quem passou ou acompanha responde.
      if (t.duvida && pode('esclarecer', t)) botoes.unshift(`<button type="button" class="btn-acao principal" data-tf-form="esclarecer" aria-expanded="false">${ic('message-check')} Responder dúvida</button>`);
      if (GC.tarefaAberta(t) && !t.respostaPendente && pode('cobrar', t)) botoes.push(`<button type="button" class="btn-sec" data-tf="cobrar" data-tf-id="${esc(t.id)}">${ic('speakerphone')} Cobrar</button>`);
      if (GC.tarefaAberta(t) && t.responsavelId && !t.atualizacaoPedidaEm && pode('pedir_atualizacao', t)) mais.push(`<button type="button" role="menuitem" data-tf="pedir_atualizacao" data-tf-id="${esc(t.id)}">${ic('bell-ringing')} Pedir notícia</button>`);
      if (GC.tarefaAberta(t) && pode('remarcar', t)) mais.push(`<button type="button" role="menuitem" data-tf-form="remarcar">${ic('calendar-time')} Mudar prazo</button>`);
      if (GC.tarefaAberta(t) && pode('cancelar', t)) mais.push(`<button type="button" role="menuitem" class="tf-perigo" data-tf-form="cancelar">${ic('x')} Cancelar demanda</button>`);
    }
    // O "⋯" fica no canto de cima: o pé do cartão só existe quando há um botão de verdade.
    const menuMais = mais.length ? `<details class="tf-mais"><summary aria-label="Mais ações" title="Mais ações">${ic('dots')}</summary><div class="tf-mais-menu" role="menu">${mais.join('')}</div></details>` : '';
    const dataPrazo = new Date(t.prazoEm).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    // Um selo só para a situação: "Atrasada há 8 h" no lugar de "Atrasada" + "atrasada há 8 h".
    const textoPrazo = GC.prazoTarefaTexto(t);
    const soAtrasada = situacao === 'atrasada';
    const seloSit = soAtrasada
      ? `<span class="tf-sit atrasada" title="Prazo: ${esc(dataPrazo)}">${ic('alert-triangle')} ${esc(textoPrazo.charAt(0).toUpperCase() + textoPrazo.slice(1))}</span>`
      : `<span class="tf-sit ${situacao}">${esc(rotuloSit)}</span>`;
    const prazoSelo = soAtrasada ? '' : GC.tarefaAberta(t)
      ? `<span class="tf-prazo ${urg}" title="Prazo: ${esc(dataPrazo)}">${ic(urg === 'atrasada' ? 'alert-triangle' : 'clock')} ${esc(textoPrazo)}</span>`
      : `<span class="tf-prazo fechada">${esc(textoPrazo)}</span>`;
    const iniciais = (nome) => String(nome || '').split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
    const avatar = t.responsavelId ? `<span class="tf-avatar" aria-hidden="true">${esc(iniciais(quem))}</span>` : `<span class="tf-avatar pasta" aria-hidden="true">${ic('building')}</span>`;
    const passada = t.criadaPor && t.criadaPor.nome ? `Passada por ${t.criadaPor.nome}${t.criadaEm ? ` em ${dataCurta(t.criadaEm)}` : ''}` : '';
    const form = (tipo, titulo, campos, botao) => `<form class="cb-form tf-form" data-tf-tipo="${tipo}" data-tf-id="${esc(t.id)}" hidden>
        <p class="cb-form-tit">${titulo}</p>${campos}<p class="cb-erro" role="alert"></p>
        <div class="cb-form-pe"><button type="submit" class="btn-acao">${botao}</button><button type="button" class="btn-sec" data-tf-fechar>Voltar</button></div>
      </form>`;
    const texto = (rotulo, ph) => `<label class="cb-campo">${rotulo}<textarea name="texto" rows="2" maxlength="${GC.LIMITES_TAREFA.resposta}" placeholder="${esc(ph)}" required></textarea></label>`;
    const formularios = gab ? '' : [
      pode('concluir', t) ? form('concluir', 'Concluir a demanda', texto('O que foi feito', 'Ex.: 42 bueiros limpos no Centro e na Vila Nova'), 'Marcar como feita') : '',
      t.respostaPendente && pode('responder', t) ? form('responder', 'Responder à cobrança', texto('O que está sendo feito e quando fica pronto', 'Ex.: equipe na rua; termina na sexta'), 'Enviar resposta') : '',
      pode('remarcar', t) ? form('remarcar', 'Mudar o prazo', `<label class="cb-campo">Novo prazo<input type="date" name="data" required min="${new Date(agora()).toISOString().slice(0, 10)}"></label>${texto('Motivo', 'Ex.: o material chega só na semana que vem')}`, 'Mudar prazo') : '',
      pode('cancelar', t) ? form('cancelar', 'Cancelar a demanda', texto('Motivo', 'Ex.: o problema foi resolvido de outro jeito'), 'Cancelar demanda') : '',
      t.duvida && pode('esclarecer', t) ? form('esclarecer', 'Responder à dúvida', texto('Resposta', 'Ex.: pode usar o material do almoxarifado central'), 'Enviar resposta') : '',
    ].join('');
    const duvida = t.duvida ? `<p class="tf-duvida">${ic('help-circle')} <b>Dúvida${t.duvida.quem ? ` de ${esc(t.duvida.quem)}` : ''}:</b> ${esc(t.duvida.texto)}</p>` : '';
    const pedida = t.atualizacaoPedidaEm && GC.tarefaAberta(t) ? `<span class="tf-pedida" title="Pedida em ${esc(new Date(t.atualizacaoPedidaEm).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }))}">${ic('bell-ringing')} Notícia pedida</span>` : '';
    const ultima = (t.historico || []).filter((h) => h.tipo === 'atualizacao').pop();
    const hist = (t.historico || []).length
      ? `<details class="tf-hist"${opcoes.aberto ? ' open' : ''}><summary>${ic('history')} Histórico <small>${t.historico.length}</small></summary><ul class="cb-historico">${t.historico.slice().reverse().map((h) => `<li><span>${esc(new Date(h.t).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }))}${h.quem ? ` · ${esc(h.quem)}` : ''}</span><p>${esc(h.texto)}</p></li>`).join('')}</ul></details>`
      : '';
    return `<li class="tf-cartao ${situacao}${opcoes.aberto ? ' destaque' : ''}" data-tf-caixa data-tf-cartao="${esc(t.id)}" id="tf-${esc(t.id)}">
        <div class="tf-cartao-topo">
          ${seloSit}
          <span class="tf-topo-dir">${prazoSelo}${pedida}${menuMais}</span>
        </div>
        <p class="tf-texto">${esc(t.texto)}</p>
        ${t.local ? `<p class="tf-local">${ic('map-pin')} ${esc([t.local.texto, nomeBairroTf(t.local.bairroId)].filter(Boolean).join(' · '))}</p>` : ''}
        ${t.detalhe ? `<p class="tf-detalhe">${esc(t.detalhe)}</p>` : ''}
        ${ultima && GC.tarefaAberta(t) ? `<p class="tf-ultima">${ic('message-2')} <span>Última notícia${ultima.quem ? ` de ${esc(ultima.quem)}` : ''}:</span> ${esc(ultima.texto)}</p>` : ''}
        ${duvida}
        <p class="tf-meta"${passada ? ` title="${esc(passada)}"` : ''}>${avatar}<b>${esc(quem)}</b>${t.responsavelId ? `<span>${esc(nomeArea(t.area))}</span>` : ''}</p>
        ${opcoes.comContexto !== false ? `<div class="tf-cartao-ctx">${GC.htmlContextoTarefa(t.contexto)}</div>` : ''}
        ${t.status === 'feita' && t.evidencia ? `<p class="tf-evidencia">${ic('check')} ${esc(t.evidencia)}</p>` : ''}
        ${botoes.length || hist ? `<div class="tf-pe">${botoes.length ? `<div class="cb-botoes">${botoes.join('')}</div>` : ''}${hist}</div>` : ''}
        ${formularios}
      </li>`;
  };

  // ---------- Formulário "Passar tarefa" ----------
  // ctx: { tipo, id, nome, area, prazoSugerido?: { em, rotulo } } fixo (veio do alerta ou da temporada), ou null
  // para escolher a que ligar. escolhas (só sem ctx): { temporadas, alertas, gabinetes }: [{ id, nome, area }].
  // texto: sugestão inicial (uma ação do "O que fazer"). opcoes.folha: abre como folha lateral (tela #/demandas),
  // com véu e botão de fechar; no detalhe do alerta e da temporada, fica no lugar.
  // A ordem segue o que a pessoa decide: o quê, ligada a quê (que já escolhe a secretaria), quem faz, até quando.
  // Lugar e detalhes, opcionais, ficam recolhidos.
  const rotulo = (texto, opcional) => `<span class="tf-rot">${texto}${opcional ? ' <span class="tf-opcional">opcional</span>' : ''}</span>`;
  GC.htmlFormTarefa = function (ctx, escolhas = {}, texto = '', opcoes = {}) {
    const areasPodem = (GC.data.areas || []).filter((a) => GC.podeNaTarefa && GC.podeNaTarefa('passar', { area: a.id }));
    const areaInicial = ctx && ctx.area && areasPodem.some((a) => a.id === ctx.area) ? ctx.area : (areasPodem[0] || {}).id;
    const gabinete = ctx && ctx.tipo === 'gabinete';
    // Secretário, diretores e servidores da pasta (o servidor recebe no portal do servidor), nessa ordem.
    const podemReceber = GC.responsaveisDemanda || GC.responsaveisPlano;
    const eu = GC.usuarioAtual ? GC.usuarioAtual() : null;
    const nivelResp = (u) => (u.perfil === 'servidor' ? 2 : GC.nivelDe(u) === 'unidade' ? 1 : 0);
    const responsaveis = areasPodem.flatMap((a) => (podemReceber ? podemReceber(a.id) : []).map((u) => ({ u, area: a.id })))
      .filter(({ u }) => !eu || u.id !== eu.id)
      .sort((a, b) => nivelResp(a.u) - nivelResp(b.u));
    const papelResp = (u) => (u.perfil === 'servidor' ? ` (${u.cargo || 'servidor'})` : GC.nivelDe(u) === 'unidade' ? ' (diretor de unidade)' : ' (secretário)');
    const optsResp = `<option value="">A secretaria (sem pessoa)</option>${responsaveis.map(({ u, area }) => `<option value="${esc(u.id)}" data-area="${esc(area)}"${area === areaInicial ? '' : ' hidden'}>${esc(u.nome)}${esc(papelResp(u))}</option>`).join('')}`;
    const sug = ctx && ctx.prazoSugerido && ctx.prazoSugerido.em > agora() + 30 * MIN ? ctx.prazoSugerido : null;
    // Prazo em botões: tudo à vista num clique. "Data…" abre o campo de data.
    const opcaoPrazo = (valor, texto, marcado, titulo) => `<label class="tf-prazo-op"${titulo ? ` title="${esc(titulo)}"` : ''}><input type="radio" name="prazo" value="${valor}"${marcado ? ' checked' : ''}><span>${esc(texto)}</span></label>`;
    const prazos = `${sug ? opcaoPrazo('sugerido', sug.rotulo, true) : ''}${GC.PRAZOS_TAREFA.map(([m, r]) => opcaoPrazo(m, r.replace(/^Em /, ''), !sug && m === 3 * 1440, r)).join('')}${opcaoPrazo('data', 'Data…', false, 'Até uma data')}`;
    const ligar = ctx ? `<p class="tf-ligada">Ligada a ${GC.htmlContextoTarefa(ctx)}</p>` : `<div class="tf-ligar">
        <label class="cb-campo">${rotulo('Ligar a', true)}<select name="ctxTipo">
          <option value="avulsa">Nada (demanda avulsa)</option>
          ${(escolhas.temporadas || []).length ? '<option value="temporada">Uma temporada do calendário</option>' : ''}
          ${(escolhas.alertas || []).length ? '<option value="alerta">Um alerta aberto</option>' : ''}
          ${(escolhas.gabinetes || []).length ? '<option value="gabinete">Um gabinete de crise aberto</option>' : ''}
        </select></label>
        ${['temporada', 'alerta', 'gabinete'].map((tipo) => ((escolhas[`${tipo}s`] || []).length ? `<label class="cb-campo" data-tf-ctx-campo="${tipo}" hidden>${GC.CONTEXTOS_TAREFA[tipo].nome}<select name="ctx_${tipo}">${escolhas[`${tipo}s`].map((x) => `<option value="${esc(x.id)}" data-area="${esc(x.area || '')}">${esc(x.nome)}</option>`).join('')}</select></label>` : '')).join('')}
      </div>`;
    const folha = !!opcoes.folha;
    const campos = `
        <label class="cb-campo">${rotulo('O que fazer')}<textarea name="texto" rows="2" maxlength="${GC.LIMITES_TAREFA.texto}" placeholder="Ex.: Limpar os bueiros da Rua das Flores" required>${esc(texto)}</textarea></label>
        ${ligar}
        <div class="tf-linha">
          <label class="cb-campo">${rotulo('Secretaria')}<select name="area"${areasPodem.length <= 1 ? ' disabled' : ''}>${areasPodem.map((a) => `<option value="${esc(a.id)}"${a.id === areaInicial ? ' selected' : ''}>${esc(a.nome)}</option>`).join('')}</select></label>
          <label class="cb-campo"${gabinete ? ' hidden' : ''} data-tf-resp>${rotulo('Quem faz')}<select name="responsavel">${optsResp}</select></label>
        </div>
        <fieldset class="tf-prazos">
          <legend class="tf-rot">Prazo</legend>
          <div class="tf-prazo-ops">${prazos}</div>
          <label class="cb-campo" data-tf-data hidden>${rotulo('Até o dia')}<input type="date" name="data" min="${new Date(agora()).toISOString().slice(0, 10)}"></label>
        </fieldset>
        <details class="tf-extra" data-tf-onde${gabinete ? ' hidden' : ''}>
          <summary>${ic('plus')} Lugar e mais detalhes <span class="tf-opcional">opcional</span></summary>
          <div class="tf-onde">
            <div class="tf-linha">
              <label class="cb-campo">${rotulo('Onde')}<input name="localTexto" maxlength="160" placeholder="Ex.: Rua das Flores, 120, em frente à padaria"></label>
              <label class="cb-campo">${rotulo('Bairro')}<select name="localBairro"><option value="">Nenhum</option>${(GC.data.bairros || []).slice().sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')).map((b) => `<option value="${esc(b.id)}">${esc(b.nome)}</option>`).join('')}</select></label>
            </div>
            <label class="cb-campo">${rotulo('Mais detalhes')}<textarea name="detalhe" rows="2" maxlength="600" placeholder="Ex.: levar tampa de 60 cm e isolar a área até terminar"></textarea></label>
            ${ctx && ctx.tipo === 'alerta' ? '<p class="tf-dica">Sem endereço, quem faz vê o lugar do alerta.</p>' : ''}
          </div>
        </details>
        <p class="cb-erro" role="alert"></p>`;
    const pe = `<div class="cb-form-pe tf-pe-form"><button type="submit" class="btn-acao principal">${ic('send')} Passar demanda</button><button type="button" class="btn-sec" data-tf-fechar>Voltar</button></div>`;
    const atributos = `class="cb-form tf-form tf-passar${folha ? ' tf-em-folha' : ''}" data-tf-tipo="passar"${ctx ? ` data-tf-ctx-fixo="${esc(ctx.tipo)}" data-tf-ctx-fixo-id="${esc(ctx.id)}" data-tf-ctx-fixo-nome="${esc(ctx.nome)}"` : ''}${sug ? ` data-tf-sugerido="${sug.em}"` : ''}`;
    if (folha) {
      return `<form ${atributos} aria-labelledby="tf-folha-tit" hidden>
        <div class="tf-folha" role="dialog" aria-modal="true" aria-labelledby="tf-folha-tit">
          <header class="tf-folha-cab"><h3 id="tf-folha-tit">Passar demanda</h3><button type="button" class="tf-folha-x" data-tf-fechar aria-label="Fechar">${ic('x')}</button></header>
          <div class="tf-folha-corpo">${campos}</div>
          ${pe}
        </div>
      </form>`;
    }
    return `<form ${atributos} hidden>
        <p class="cb-form-tit">Passar demanda</p>
        ${campos}
        ${pe}
      </form>`;
  };

  // Prazo do formulário em ms: um dos prontos, a data escolhida (fim do dia) ou o sugerido pelo contexto.
  function prazoDoForm(form) {
    const marcado = form.querySelector('[name="prazo"]:checked');
    const v = marcado ? marcado.value : '';
    if (v === 'sugerido') return Number(form.dataset.tfSugerido);
    if (v === 'data') {
      const d = form.querySelector('[name="data"]').value;
      if (!d) return NaN;
      const [a, m, dia] = d.split('-').map(Number);
      return new Date(a, m - 1, dia, 23, 59).getTime();
    }
    return agora() + Number(v) * MIN;
  }

  // ---------- Bloco do contexto (alerta, temporada) ----------
  // ctx: { tipo, id, nome, area, prazoSugerido? }. Mostra as tarefas visíveis do contexto e "Passar tarefa".
  GC.htmlBlocoTarefas = function (ctx, opcoes = {}) {
    if (!GC.tarefas || !ctx) return '';
    const todas = GC.tarefasVisiveis(GC.tarefas.doContexto(ctx.tipo, ctx.id));
    const abertas = todas.filter(GC.tarefaAberta).sort((a, b) => a.prazoEm - b.prazoEm);
    const fechadas = todas.filter((t) => !GC.tarefaAberta(t)).sort((a, b) => (b.feitaEm || b.criadaEm) - (a.feitaEm || a.criadaEm));
    const podePassar = (GC.data.areas || []).some((a) => GC.podeNaTarefa && GC.podeNaTarefa('passar', { area: a.id }));
    if (!todas.length && !podePassar) return '';
    const atrasadas = abertas.filter((t) => GC.tarefaAtrasada(t)).length;
    return `<section class="cb-bloco tf-bloco" data-tf-caixa>
        <div class="cb-bloco-cab"><h3>${ic('clipboard-list')} Demandas${abertas.length ? ` · ${abertas.length} aberta${abertas.length === 1 ? '' : 's'}` : ''}${atrasadas ? ` <span class="tf-sit atrasada">${atrasadas} atrasada${atrasadas === 1 ? '' : 's'}</span>` : ''}</h3>
          ${podePassar ? `<button type="button" class="btn-sec" data-tf-form="passar" aria-expanded="false">${ic('plus')} Passar demanda</button>` : ''}</div>
        ${podePassar ? GC.htmlFormTarefa(ctx, {}, opcoes.texto || '') : ''}
        ${todas.length ? `<ul class="tf-lista">${abertas.map((t) => GC.htmlCartaoTarefa(t, { comContexto: false })).join('')}</ul>` : `<p class="tf-vazio">Nenhuma demanda passada${ctx.tipo === 'temporada' ? ' para esta temporada' : ' para este alerta'}.</p>`}
        ${fechadas.length ? `<details class="tf-fechadas"><summary>${fechadas.length} feita${fechadas.length === 1 ? '' : 's'} ou cancelada${fechadas.length === 1 ? '' : 's'}</summary><ul class="tf-lista">${fechadas.map((t) => GC.htmlCartaoTarefa(t, { comContexto: false })).join('')}</ul></details>` : ''}
      </section>`;
  };

  // ---------- Cliques ----------
  // acoes: { executar?(acao, id, dados) → { ok, motivo } (padrão: GC.agirNaTarefa), aoIrContexto?(tipo, id), aoConcluir?() }
  GC.ligarTarefas = function (raiz, acoes = {}) {
    if (!raiz || raiz.dataset.tfLigado) return;
    raiz.dataset.tfLigado = '1';
    const executar = (...a) => (acoes.executar || GC.agirNaTarefa || (() => ({ ok: false, motivo: 'permissao' })))(...a) || { ok: false };
    const irContexto = (tipo, id) => (acoes.aoIrContexto || GC.irParaContextoTarefa || (() => {}))(tipo, id);

    // Menu "⋯" do cartão: um aberto por vez, fecha ao escolher, ao clicar fora dele e com Esc.
    const fecharMenus = (menos) => raiz.querySelectorAll('.tf-mais[open]').forEach((d) => { if (d !== menos) d.open = false; });
    if (typeof document !== 'undefined') document.addEventListener('click', (e) => { if (!raiz.contains(e.target)) fecharMenus(); });
    // Folha lateral (tela #/demandas): fecha no véu, no X, no "Voltar" e com Esc; o foco volta ao botão que abriu.
    const fecharFolha = (form) => {
      form.hidden = true;
      const dono = form.closest('[data-tf-caixa]');
      if (dono) {
        marcarAberto(dono);
        const b = dono.querySelector('[data-tf-form="passar"]');
        if (b) b.focus({ preventScroll: true });
      }
    };
    // Na captura do documento: o Esc geral (js/app.js) fecharia a tela inteira antes.
    if (typeof document !== 'undefined') {
      document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        const folha = raiz.querySelector('.tf-em-folha:not([hidden])');
        if (!folha || !raiz.isConnected || raiz.closest('[hidden]')) return;
        e.stopImmediatePropagation();
        e.preventDefault();
        fecharFolha(folha);
      }, true);
    }
    raiz.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      const d = e.target.closest && e.target.closest('.tf-mais[open]');
      if (!d) return;
      e.stopPropagation();
      d.open = false;
      d.querySelector('summary').focus();
    });
    const marcarAberto = (dono) => dono.querySelectorAll('[data-tf-form]').forEach((b) => {
      if (b.closest('[data-tf-caixa]') !== dono) return;
      const f = [...dono.querySelectorAll('.cb-form[data-tf-tipo]')].find((x) => x.dataset.tfTipo === b.dataset.tfForm && x.closest('[data-tf-caixa]') === dono);
      b.setAttribute('aria-expanded', String(!!f && !f.hidden));
    });

    raiz.addEventListener('click', (e) => {
      fecharMenus(e.target.closest('.tf-mais'));
      if (e.target.matches && e.target.matches('.tf-em-folha')) { fecharFolha(e.target); return; } // o véu
      const alvo = e.target.closest('[data-tf], [data-tf-form], [data-tf-fechar], [data-tf-ctx], [data-tf-prefill]');
      if (!alvo || !raiz.contains(alvo)) return;
      e.stopPropagation();
      const menu = alvo.closest('.tf-mais');
      if (menu) menu.open = false;
      if (alvo.matches('[data-tf]')) {
        const r = executar(alvo.dataset.tf, alvo.dataset.tfId, {});
        if (r.ok && acoes.aoConcluir) acoes.aoConcluir();
        return;
      }
      if (alvo.matches('[data-tf-ctx]')) { irContexto(alvo.dataset.tfCtx, alvo.dataset.tfCtxId); return; }
      if (alvo.matches('[data-tf-fechar]')) {
        const f = alvo.closest('.cb-form');
        if (f.classList.contains('tf-em-folha')) { fecharFolha(f); return; }
        f.hidden = true;
        const dono = alvo.closest('[data-tf-caixa]');
        if (dono) marcarAberto(dono);
        return;
      }
      // "Passar" ao lado de uma ação do "O que fazer": abre o formulário do bloco com o texto dela.
      if (alvo.matches('[data-tf-prefill]')) {
        const bloco = raiz.querySelector('.tf-bloco');
        const form = bloco && bloco.querySelector('.tf-passar');
        if (!form) return;
        form.hidden = false;
        form.querySelector('[name="texto"]').value = alvo.dataset.tfPrefill;
        form.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        form.querySelector('[name="texto"]').focus();
        return;
      }
      const dono = alvo.closest('[data-tf-caixa]');
      const tipo = alvo.dataset.tfForm;
      const form = dono && [...dono.querySelectorAll('.cb-form[data-tf-tipo]')].find((f) => f.dataset.tfTipo === tipo && f.closest('[data-tf-caixa]') === dono);
      if (!form) return;
      dono.querySelectorAll('.cb-form[data-tf-tipo]').forEach((f) => { if (f !== form && f.closest('[data-tf-caixa]') === dono) f.hidden = true; });
      form.hidden = !form.hidden;
      marcarAberto(dono);
      if (!form.hidden) {
        if (!form.classList.contains('tf-em-folha')) form.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        const c = form.querySelector('textarea, input:not([type=hidden]), select');
        if (c) c.focus({ preventScroll: true });
      }
    });

    // Campos que dependem de outros: responsável pela secretaria, data pelo prazo, contexto pelo tipo.
    raiz.addEventListener('change', (e) => {
      const form = e.target.closest('.tf-passar');
      if (!form) return;
      const nome = e.target.name;
      if (nome === 'area') {
        if (e.isTrusted) form.dataset.tfAreaEscolhida = '1'; // escolhida à mão: o contexto não troca mais
        const area = e.target.value;
        const sel = form.querySelector('[name="responsavel"]');
        [...sel.options].forEach((o) => { if (o.value) o.hidden = o.dataset.area !== area; });
        if (sel.selectedOptions[0] && sel.selectedOptions[0].hidden) sel.value = '';
      }
      if (nome === 'prazo') form.querySelector('[data-tf-data]').hidden = e.target.value !== 'data';
      if (nome === 'ctxTipo' || nome.startsWith('ctx_')) {
        const tipo = form.querySelector('[name="ctxTipo"]').value;
        form.querySelectorAll('[data-tf-ctx-campo]').forEach((c) => { c.hidden = c.dataset.tfCtxCampo !== tipo; });
        form.querySelector('[data-tf-resp]').hidden = tipo === 'gabinete'; // a tarefa do gabinete é da secretaria
        form.querySelector('[data-tf-onde]').hidden = tipo === 'gabinete'; // e não guarda local nem detalhes
        // A secretaria acompanha o contexto escolhido, a não ser que a pessoa já a tenha escolhido à mão.
        const sel = tipo !== 'avulsa' ? form.querySelector(`[name="ctx_${tipo}"]`) : null;
        const areaCtx = sel && sel.selectedOptions[0] ? sel.selectedOptions[0].dataset.area : '';
        const area = form.querySelector('[name="area"]');
        if (!form.dataset.tfAreaEscolhida && areaCtx && [...area.options].some((o) => o.value === areaCtx)) { area.value = areaCtx; area.dispatchEvent(new Event('change', { bubbles: true })); }
      }
    });

    raiz.addEventListener('submit', (e) => {
      const form = e.target.closest('.cb-form[data-tf-tipo]');
      if (!form) return;
      e.preventDefault();
      e.stopPropagation();
      const erro = form.querySelector('.cb-erro');
      const tipo = form.dataset.tfTipo;
      const val = (n) => { const c = form.querySelector(`[name="${n}"]`); return c ? c.value : ''; };
      let r;
      if (tipo === 'passar') {
        let contexto;
        if (form.dataset.tfCtxFixo) contexto = { tipo: form.dataset.tfCtxFixo, id: form.dataset.tfCtxFixoId, nome: form.dataset.tfCtxFixoNome };
        else {
          const t = val('ctxTipo') || 'avulsa';
          const sel = t !== 'avulsa' ? form.querySelector(`[name="ctx_${t}"]`) : null;
          contexto = t === 'avulsa' ? { tipo: 'avulsa' } : { tipo: t, id: sel.value, nome: sel.selectedOptions[0] ? sel.selectedOptions[0].textContent : '' };
        }
        const local = val('localTexto').trim() || val('localBairro') ? { texto: val('localTexto'), bairroId: val('localBairro') || null } : null;
        r = executar('passar', null, Object.assign({ texto: val('texto'), area: val('area'), responsavelId: val('responsavel') || null, prazoEm: prazoDoForm(form), contexto },
          local ? { local } : {}, val('detalhe').trim() ? { detalhe: val('detalhe') } : {}));
      } else if (tipo === 'remarcar') {
        const d = val('data');
        const [a, m, dia] = (d || '').split('-').map(Number);
        r = executar('remarcar', form.dataset.tfId, { prazoEm: d ? new Date(a, m - 1, dia, 23, 59).getTime() : NaN, texto: val('texto') });
      } else r = executar(tipo, form.dataset.tfId, { texto: val('texto') });
      if (!r.ok) { erro.textContent = GC.ERROS_TAREFA[r.motivo] || 'Não deu certo. Tente de novo.'; return; }
      form.hidden = true;
      form.reset();
      delete form.dataset.tfAreaEscolhida;
      const campoData = form.querySelector('[data-tf-data]');
      if (campoData) campoData.hidden = true;
      const extra = form.querySelector('.tf-extra');
      if (extra) extra.open = false;
      const dono = form.closest('[data-tf-caixa]');
      if (dono) marcarAberto(dono);
      if (acoes.aoConcluir) acoes.aoConcluir();
    });
  };
})(window.GC = window.GC || {});
