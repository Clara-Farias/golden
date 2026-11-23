(function (GC) {
  // Modelos de gabinete de crise (#/crise/modelos): a lista dos modelos e o editor de cada um (tarefas
  // por secretaria, questões que a sala precisa responder e orientação do comunicado). Registro em
  // js/modelos-crise.js; as ações passam por js/app/telas.js (permissão crise.modelos e auditoria).
  // O editor de tarefas e questões também é usado em tela-crise.js, para revisar o plano antes de convocar.
  const esc = (t) => GC.escaparHtml(t);
  const PRAZOS = [15, 30, 45, 60, 90, 120, 180, 240, 360, 720, 1440];
  const areas = () => GC.data.areas;
  const nomeArea = (id) => { const a = areas().find((x) => x.id === id); return a ? (a.secretaria ? a.secretaria.nome : a.nome) : id; };
  const tempo = (m) => (GC.tempoTexto ? GC.tempoTexto(m) : `${m} min`);

  // ---------- Editor de tarefas e questões (modelo e plano antes de convocar) ----------
  // comSempre: mostra "Chamar sempre" (só no modelo: sem ele, a tarefa entra se a pasta estiver na ocorrência).
  function linhaTarefa(t, comSempre) {
    const prazos = PRAZOS.includes(t.prazoMin) || !t.prazoMin ? PRAZOS : [...PRAZOS, t.prazoMin].sort((a, b) => a - b);
    return `<li class="mc-tarefa" data-linha-tarefa>
      <label><span>Secretaria</span><select name="area">${areas().map((a) => `<option value="${esc(a.id)}"${a.id === t.area ? ' selected' : ''}>${esc(nomeArea(a.id))}</option>`).join('')}</select></label>
      <label class="mc-tarefa-texto"><span>O que fazer</span><input name="texto" maxlength="160" value="${esc(t.texto || '')}" placeholder="Ex.: Liberar a escola de {b} como abrigo"></label>
      <label><span>Prazo</span><select name="prazo">${prazos.map((m) => `<option value="${m}"${m === (t.prazoMin || 60) ? ' selected' : ''}>${esc(tempo(m))}</option>`).join('')}</select></label>
      ${comSempre ? `<label class="mc-sempre" title="Sem marcar, a secretaria só recebe a demanda quando já está na ocorrência"><input type="checkbox" name="sempre"${t.sempre !== false ? ' checked' : ''}> Chamar sempre</label>` : ''}
      <button type="button" class="mc-tirar" data-tirar aria-label="Tirar demanda">✕</button>
    </li>`;
  }
  const linhaPergunta = (texto) => `<li class="mc-pergunta" data-linha-pergunta>
      <input name="pergunta" maxlength="160" value="${esc(texto || '')}" placeholder="Ex.: Quantas famílias precisam de abrigo?" aria-label="Questão">
      <button type="button" class="mc-tirar" data-tirar aria-label="Tirar questão">✕</button>
    </li>`;

  GC.editorTarefasCrise = function ({ tarefas = [], perguntas = [], comSempre = false, dica = '' } = {}) {
    return `<div class="mc-editor" data-editor-crise data-sempre="${comSempre ? '1' : ''}">
      <h4>Demandas por secretaria</h4>
      ${dica ? `<p class="mc-dica">${dica}</p>` : ''}
      <ul class="mc-tarefas" data-lista-tarefas>${tarefas.map((t) => linhaTarefa(t, comSempre)).join('')}</ul>
      <button type="button" class="mc-mais" data-mais-tarefa>+ Demanda</button>
      <h4>Questões que a sala precisa responder</h4>
      <ul class="mc-perguntas" data-lista-perguntas>${perguntas.map(linhaPergunta).join('')}</ul>
      <button type="button" class="mc-mais" data-mais-pergunta>+ Questão</button>
    </div>`;
  };

  // Liga "+ Tarefa", "+ Questão" e "✕" mexendo só no DOM (o que já foi digitado não se perde).
  GC.ligarEditorTarefasCrise = function (raiz) {
    const ed = raiz && raiz.querySelector('[data-editor-crise]');
    if (!ed || ed.dataset.ligado) return;
    ed.dataset.ligado = '1';
    const comSempre = !!ed.dataset.sempre;
    const L = GC.LIMITES_MODELO_CRISE || { tarefas: 15, perguntas: 10 };
    ed.addEventListener('click', (ev) => {
      const b = ev.target.closest('button');
      if (!b || !ed.contains(b)) return;
      if (b.hasAttribute('data-tirar')) { b.closest('li').remove(); return; }
      if (b.hasAttribute('data-mais-tarefa')) {
        const lista = ed.querySelector('[data-lista-tarefas]');
        if (lista.children.length >= L.tarefas) return;
        const ultima = lista.lastElementChild;
        const area = ultima ? ultima.querySelector('[name="area"]').value : areas()[0].id;
        lista.insertAdjacentHTML('beforeend', linhaTarefa({ area, texto: '', prazoMin: 60, sempre: true }, comSempre));
        lista.lastElementChild.querySelector('[name="texto"]').focus();
      }
      if (b.hasAttribute('data-mais-pergunta')) {
        const lista = ed.querySelector('[data-lista-perguntas]');
        if (lista.children.length >= L.perguntas) return;
        lista.insertAdjacentHTML('beforeend', linhaPergunta(''));
        lista.lastElementChild.querySelector('input').focus();
      }
    });
  };

  GC.lerEditorTarefasCrise = function (raiz) {
    const ed = raiz && raiz.querySelector('[data-editor-crise]');
    if (!ed) return { tarefas: [], perguntas: [] };
    return {
      tarefas: [...ed.querySelectorAll('[data-linha-tarefa]')].map((li) => ({
        area: li.querySelector('[name="area"]').value,
        texto: li.querySelector('[name="texto"]').value.trim(),
        prazoMin: Number(li.querySelector('[name="prazo"]').value),
        sempre: li.querySelector('[name="sempre"]') ? li.querySelector('[name="sempre"]').checked : true,
      })).filter((t) => t.texto),
      perguntas: [...ed.querySelectorAll('[data-linha-pergunta] input')].map((i) => i.value.trim()).filter(Boolean),
    };
  };

  // ---------- Tela dos modelos ----------
  const ERROS = {
    nome: 'Dê um nome ao modelo.',
    nome_repetido: 'Já existe um modelo com esse nome.',
    area: 'Escolha a secretaria de cada demanda.',
    prazo: 'O prazo de cada demanda vai de 5 minutos a 24 horas.',
    tarefas_demais: 'Um modelo tem até 15 demandas.',
    perguntas_demais: 'Um modelo tem até 10 questões.',
    padrao: 'O modelo "Outras crises" vale para todo tipo sem modelo e não pode ser removido.',
    sem_permissao: 'Só o Gabinete do Prefeito muda os modelos.',
    nao_existe: 'Esse modelo não existe mais.',
  };

  GC.criarTelaModelosCrise = function (el, cb) {
    const pode = () => (GC.pode ? GC.pode('crise.modelos', null) : true);
    const reg = () => GC.modelosCrise;

    function cartao(m) {
      const selo = m.fabrica ? (m.alterado ? '<span class="mc-selo alterado">Alterado</span>' : '<span class="mc-selo">Padrão</span>') : '<span class="mc-selo criado">Criado</span>';
      const tipos = m.tipos.length ? m.tipos.map((t) => `<span class="cr-chip">${esc(t)}</span>`).join('') : `<span class="mc-nota">${m.padrao ? 'Vale para todo tipo sem modelo' : 'Nenhum tipo: só se escolhido na hora de abrir'}</span>`;
      const pastas = [...new Set(m.tarefas.filter((t) => t.sempre !== false).map((t) => t.area))];
      return `<li class="painel-card mc-cartao">
        <div class="mc-cartao-topo"><b>${esc(m.emoji || '🚨')} ${esc(m.nome)}</b>${selo}</div>
        <div class="mc-tipos">${tipos}</div>
        <p class="mc-numeros">${m.tarefas.length} ${m.tarefas.length === 1 ? 'demanda' : 'demandas'} · ${m.perguntas.length} ${m.perguntas.length === 1 ? 'questão' : 'questões'}${pastas.length ? ` · chama ${pastas.map(nomeArea).join(', ')}` : ''}</p>
        <div class="mc-cartao-acoes">
          <button type="button" class="btn-sec" data-ir-modelo="${esc(m.id)}">${pode() ? '✎ Editar' : 'Ver'}</button>
          ${pode() ? `<button type="button" class="cr-link" data-duplicar="${esc(m.id)}">Duplicar</button>` : ''}
        </div>
      </li>`;
    }

    function lista() {
      const removidos = reg().removidos();
      el.innerHTML = `
        <nav class="cr-abas" aria-label="Gabinetes"><button type="button" class="cr-voltar" data-voltar>← Gabinetes de crise</button></nav>
        <header class="sec-topo"><div>
          <p class="cr-sobre mc-sobre">📋 Modelos de gabinete</p>
          <h2>Modelos de gabinete de crise</h2>
          <p>Cada tipo de crise abre o gabinete com as demandas, as questões e a orientação do modelo dele. Antes de convocar, dá para ajustar o que vem pronto; mudar um modelo vale para os próximos gabinetes, não para os que já estão abertos.</p>
        </div>${pode() ? '<span class="sec-acoes"><button type="button" class="btn-primario" data-duplicar="geral">+ Novo modelo</button></span>' : ''}</header>
        ${pode() ? '' : '<p class="cr-nota-perfil">Quem cria e edita os modelos é o Gabinete do Prefeito.</p>'}
        <ul class="mc-lista">${reg().lista().map(cartao).join('')}</ul>
        ${removidos.length ? `<section class="painel-card"><h3>Removidos</h3><ul class="mc-removidos">${removidos.map((m) => `<li><span>${esc(m.emoji)} ${esc(m.nome)}</span>${pode() ? `<button type="button" class="cr-link" data-restaurar="${esc(m.id)}">Restaurar</button>` : ''}</li>`).join('')}</ul></section>` : ''}`;
      el.querySelector('[data-voltar]').onclick = () => cb.ir({ tela: 'crise', id: null });
      el.querySelectorAll('[data-ir-modelo]').forEach((b) => { b.onclick = () => cb.ir({ tela: 'crise', id: null, modelos: true, modelo: b.dataset.irModelo }); });
      el.querySelectorAll('[data-duplicar]').forEach((b) => { b.onclick = () => cb.ir({ tela: 'crise', id: null, modelos: true, modelo: 'novo', base: b.dataset.duplicar }); });
      el.querySelectorAll('[data-restaurar]').forEach((b) => { b.onclick = () => { cb.aoRestaurar(b.dataset.restaurar); lista(); }; });
    }

    // Tipos de ocorrência: marcados os deste modelo; os de outro modelo mostram de quem são (marcar muda).
    function tiposHtml(m) {
      const dono = new Map();
      reg().lista().forEach((x) => { if (x.id !== m.id) x.tipos.forEach((t) => dono.set(t, x.nome)); });
      return GC.tiposDeCrise().map((t) => `<label class="mc-tipo${m.tipos.includes(t) ? ' marcado' : ''}"><input type="checkbox" name="tipo" value="${esc(t)}"${m.tipos.includes(t) ? ' checked' : ''}${pode() ? '' : ' disabled'}> ${esc(t)}${dono.has(t) && !m.tipos.includes(t) ? ` <small>hoje em ${esc(dono.get(t))}</small>` : ''}</label>`).join('');
    }

    function editor(rota) {
      const novo = rota.modelo === 'novo';
      const base = novo ? (reg().buscar(rota.base) || reg().buscar('geral')) : reg().buscar(rota.modelo);
      if (!base) { lista(); return; }
      const m = novo ? Object.assign({}, base, { id: null, nome: rota.base === 'geral' ? '' : `${base.nome} (cópia)`, tipos: [], fabrica: false, alterado: false, padrao: false }) : base;
      const so = pode() ? '' : ' disabled';
      el.innerHTML = `
        <nav class="cr-abas" aria-label="Modelos"><button type="button" class="cr-voltar" data-voltar>← Modelos de gabinete</button></nav>
        <form class="mc-form" novalidate>
          <header class="sec-topo"><div>
            <p class="cr-sobre mc-sobre">📋 ${novo ? 'Novo modelo' : 'Modelo de gabinete'}</p>
            <h2>${novo ? (rota.base === 'geral' ? 'Novo modelo' : `Novo modelo a partir de "${esc(base.nome)}"`) : `${esc(m.emoji || '🚨')} ${esc(m.nome)}`}</h2>
            ${m.fabrica ? `<p>${m.alterado ? 'Modelo padrão alterado: "Voltar ao padrão" desfaz as mudanças.' : 'Modelo padrão do sistema.'}</p>` : ''}
          </div></header>
          <div class="sec-grade mc-grade">
            <section class="painel-card">
              <label class="mc-campo"><span>Nome do modelo</span><input name="nome" maxlength="60" value="${esc(m.nome)}" required${so}></label>
              <h4>Tipos de ocorrência que abrem com este modelo</h4>
              <div class="mc-tipos-escolha">${tiposHtml(m)}</div>
              ${m.padrao ? '<p class="mc-dica">Tipo sem modelo também abre com este.</p>' : ''}
            </section>
            <section class="painel-card">
              <h4>Orientação à população (comunicado)</h4>
              <label class="mc-campo"><span>Texto completo (WhatsApp, redes, rádio)</span><textarea name="orientacao" rows="3" maxlength="400"${so}>${esc(m.orientacao || '')}</textarea></label>
              <label class="mc-campo"><span>Versão curta para SMS (sem acento cabe mais)</span><input name="orientacaoCurta" maxlength="90" value="${esc(m.orientacaoCurta || '')}"${so}></label>
            </section>
          </div>
          <section class="painel-card">
            ${GC.editorTarefasCrise({ tarefas: m.tarefas, perguntas: m.perguntas, comSempre: true, dica: 'Use <b>{b}</b> para o bairro e <b>{l}</b> para o local da crise. Demanda sem "Chamar sempre" só entra quando a secretaria já está na ocorrência.' })}
          </section>
          <p class="cr-erro" role="alert" hidden></p>
          ${pode() ? `<div class="mc-botoes">
            <button type="submit" class="btn-primario">${novo ? 'Criar modelo' : 'Salvar modelo'}</button>
            <button type="button" class="btn-sec" data-voltar>Cancelar</button>
            <span class="mc-espaco"></span>
            ${!novo && m.fabrica && m.alterado ? '<button type="button" class="btn-sec" data-restaurar-este>↻ Voltar ao padrão</button>' : ''}
            ${!novo && !m.padrao ? '<button type="button" class="btn-sec mc-perigo" data-excluir>🗑 Remover modelo</button>' : ''}
          </div>` : ''}
        </form>`;
      const form = el.querySelector('form');
      const erro = form.querySelector('.cr-erro');
      const mostrarErro = (motivo) => { erro.textContent = ERROS[motivo] || 'Não deu para salvar o modelo.'; erro.hidden = false; };
      if (!pode()) form.querySelectorAll('input, select, textarea, [data-mais-tarefa], [data-mais-pergunta], [data-tirar]').forEach((x) => { x.disabled = true; });
      else GC.ligarEditorTarefasCrise(form);
      el.querySelectorAll('[data-voltar]').forEach((b) => { b.onclick = () => cb.ir({ tela: 'crise', id: null, modelos: true }); });
      form.querySelectorAll('.mc-tipo input').forEach((i) => { i.onchange = () => i.closest('.mc-tipo').classList.toggle('marcado', i.checked); });
      form.onsubmit = (ev) => {
        ev.preventDefault();
        if (!pode()) return;
        const dados = Object.assign({
          nome: form.nome.value, emoji: m.emoji,
          tipos: [...form.querySelectorAll('[name="tipo"]:checked')].map((i) => i.value),
          orientacao: form.orientacao.value, orientacaoCurta: form.orientacaoCurta.value,
        }, GC.lerEditorTarefasCrise(form));
        const r = novo ? cb.aoCriar(base.id, dados) : cb.aoSalvar(m.id, dados);
        if (!r || !r.ok) { mostrarErro(r && r.motivo); return; }
        cb.ir({ tela: 'crise', id: null, modelos: true });
      };
      const restaurar = form.querySelector('[data-restaurar-este]');
      if (restaurar) restaurar.onclick = () => { cb.aoRestaurar(m.id); editor(rota); };
      const excluir = form.querySelector('[data-excluir]');
      if (excluir) {
        excluir.onclick = async () => {
          const ok = GC.confirmar
            ? await GC.confirmar({ titulo: `Remover o modelo "${m.nome}"?`, texto: m.tipos.length ? `Os tipos ${m.tipos.join(', ')} passam a abrir com o modelo "Outras crises". Os gabinetes já abertos não mudam.` : 'Os gabinetes já abertos não mudam.', sim: 'Remover modelo', perigo: true })
            : window.confirm(`Remover o modelo "${m.nome}"?`);
          if (!ok) return;
          const r = cb.aoExcluir(m.id);
          if (r && r.ok) cb.ir({ tela: 'crise', id: null, modelos: true }); else mostrarErro(r && r.motivo);
        };
      }
    }

    // O retrato da lista: a tela só se redesenha sozinha quando ele muda (desfazer, outra aba).
    const retrato = () => JSON.stringify([reg().lista(), reg().removidos().map((m) => m.id), pode()]);
    let ultimo = null;
    function mostrar(rota) {
      ultimo = retrato();
      if (rota && rota.modelo) editor(rota); else lista();
    }
    // A cada render do app: a lista acompanha; o editor aberto não é trocado (pode haver texto digitado).
    function atualizar(rota) {
      if (rota && rota.modelo) return;
      if (retrato() !== ultimo) mostrar(rota);
    }
    return { mostrar, atualizar };
  };
})(window.GC = window.GC || {});
