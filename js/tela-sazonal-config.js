(function (GC) {
  // Configuração do calendário sazonal (#/sazonal/config): a lista das temporadas e o editor de cada uma (quando
  // acontece, quanto antes preparar, o porquê, a dica ao cidadão e o que fazer, com a meta do plano de cada ação).
  // Registro em js/sazonal-registro.js; as ações passam por js/app/telas.js (permissão sazonal.editar, auditoria
  // sazonal_* e "Desfazer"). Quem não pode mudar vê tudo, sem os botões.
  const esc = (t) => GC.escaparHtml(t);
  const ic = (nome, cls) => GC.icone(nome, cls);
  const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
  const nomeArea = (id) => ((GC.data.areas || []).find((a) => a.id === id) || { nome: id }).nome;

  const ERROS = {
    nome: 'Dê um nome à temporada.',
    nome_repetido: 'Já existe uma temporada com esse nome.',
    area: 'Escolha a secretaria responsável.',
    serie: 'Escolha a série que mostra a temporada.',
    meses: 'Escolha o mês em que a temporada começa e o mês em que termina.',
    preparo: 'A preparação começa de 0 a 6 meses antes.',
    porque: 'Diga por que a época pede algo da prefeitura.',
    acoes: 'Escreva ao menos uma ação do que fazer.',
    acoes_demais: 'Uma temporada tem até 6 ações.',
    meta: 'Um dos compromissos escolhidos não existe mais no plano de governo.',
    ultima: 'O calendário precisa de ao menos uma temporada.',
    sem_permissao: 'Só o Gabinete do Prefeito muda o calendário sazonal.',
    nao_existe: 'Essa temporada não existe mais.',
  };

  // Faixa de 12 meses (jan a dez) de uma temporada já calculada pelo motor: a mesma leitura da grade do calendário.
  function faixa(t) {
    if (!t) return '<span class="szc-faixa vazia">Escolha quando acontece para ver a prévia.</span>';
    const hoje = GC.sazonal.mesCenario();
    const cel = GC.sazonal.CURTOS.map((c, m) => {
      const em = t.meses.includes(m);
      const i = em && t.intensidade ? t.intensidade[m] : null;
      const tom = !em ? '' : i == null ? 't500' : i >= 1 ? 't700' : i >= 0.85 ? 't600' : i >= 0.7 ? 't500' : i >= 0.55 ? 't400' : 't300';
      const cls = [em ? `em ${tom}` : t.preparo.includes(m) ? 'prep' : '', m === t.pico ? 'pico' : '', m === hoje ? 'hoje' : ''].filter(Boolean).join(' ');
      return `<i class="${cls}" title="${esc(GC.sazonal.NOMES_MES[m])}"></i>`;
    }).join('');
    return `<span class="szc-faixa" aria-hidden="true">${cel}</span>`;
  }
  const meses = () => GC.sazonal.CURTOS.map((c) => `<span>${c}</span>`).join('');

  GC.criarTelaSazonalConfig = function (el, cb) {
    const pode = () => (GC.pode ? GC.pode('sazonal.editar', null) : true);
    const reg = () => GC.registroSazonal;
    const calculada = (id) => GC.sazonal.temporadas().find((t) => t.id === id) || null;

    // ---------- Lista ----------
    function cartao(t) {
      const c = calculada(t.id);
      const selo = t.fabrica ? (t.alterado ? '<span class="szc-selo alterado">Alterada</span>' : '<span class="szc-selo">Padrão</span>') : '<span class="szc-selo criada">Criada</span>';
      const quando = c ? GC.sazonal.periodo(c) : '—';
      const origem = t.serie ? 'calculada da série' : 'data conhecida';
      const metas = t.acoes.filter((a) => a.meta).length;
      return `<li class="szc-item">
        <span class="szc-item-nome">${ic(t.icone)}<span><b>${esc(t.nome)}</b> ${selo}
          <small>${esc(quando)} · ${origem} · preparar ${plural(t.preparo, 'mês', 'meses')} antes</small></span></span>
        ${faixa(c)}
        <span class="szc-item-num">${plural(t.acoes.length, 'ação', 'ações')}${metas ? ` · ${plural(metas, 'compromisso', 'compromissos')}` : ''}${t.cidadao ? ' · dica ao cidadão' : ''}</span>
        <span class="szc-item-acoes">
          <button type="button" class="btn-sec" data-ir="${esc(t.id)}">${pode() ? `${ic('pencil')} Editar` : 'Ver'}</button>
          ${pode() ? `<button type="button" class="sz-link" data-duplicar="${esc(t.id)}">Duplicar</button>` : ''}
        </span>
      </li>`;
    }

    function lista() {
      const todas = reg().lista();
      const areas = [...new Set(todas.map((t) => t.area))];
      const removidas = reg().removidas();
      el.innerHTML = `<div data-szc-lista>
        <nav class="szc-nav"><button type="button" class="sz-link" data-voltar>${ic('arrow-left')} Calendário sazonal</button></nav>
        <header class="sec-topo"><div>
          <h2>${ic('calendar-cog')} Configurar o calendário</h2>
          <p>Cada temporada diz quando a época acontece, quanto antes a prefeitura se prepara e o que fazer. O que mudar aqui vale na hora para o calendário, o widget, a Maia, o telão e o Portal do Cidadão.</p>
        </div>${pode() ? `<span class="sec-acoes"><button type="button" class="btn-primario" data-nova>${ic('plus')} Nova temporada</button></span>` : ''}</header>
        ${pode() ? '' : '<p class="szc-aviso">Quem cria e edita as temporadas é o Gabinete do Prefeito.</p>'}
        <section class="rel-cartao szc-lista">
          <div class="szc-cab" aria-hidden="true"><span></span><span class="szc-meses">${meses()}</span><span></span><span></span></div>
          ${areas.map((a) => `<h3>${esc(nomeArea(a))}</h3><ul>${todas.filter((t) => t.area === a).map(cartao).join('')}</ul>`).join('')}
          <p class="w-saz-legenda sz-legenda" aria-hidden="true"><span><i class="sz-escala"></i>temporada</span> <span><i class="sz-leg-pico"></i>pico</span> <span><i class="prep"></i>preparar</span> <span><i class="sz-leg-hoje"></i>hoje</span></p>
        </section>
        ${removidas.length ? `<section class="rel-cartao"><h3>Removidas</h3><ul class="szc-removidas">${removidas.map((t) => `<li><span>${ic(t.icone)} ${esc(t.nome)} <small>${esc(nomeArea(t.area))}</small></span>${pode() ? `<button type="button" class="sz-link" data-restaurar="${esc(t.id)}">Restaurar</button>` : ''}</li>`).join('')}</ul></section>` : ''}</div>`;
    }

    // ---------- Editor ----------
    const opcoesMes = (sel) => GC.sazonal.CURTOS.map((c, m) => `<option value="${c}"${c === sel ? ' selected' : ''}>${esc(GC.sazonal.NOMES_MES[m])}</option>`).join('');
    const opcoesMeta = (meta) => `<option value="">Sem compromisso do plano</option>${GC.metasParaSazonal().map((g) => `<optgroup label="${esc(g.nome)}">${g.metas.map((titulo) => {
      const v = `${g.area}|${titulo}`;
      return `<option value="${esc(v)}"${meta && meta.area === g.area && meta.titulo === titulo ? ' selected' : ''}>${esc(titulo)}</option>`;
    }).join('')}</optgroup>`).join('')}`;
    const linhaAcao = (a = {}) => `<li class="szc-acao" data-acao>
        <label class="szc-acao-texto"><span>O que fazer</span><input name="acao" maxlength="${GC.LIMITES_SAZONAL.texto}" value="${esc(a.texto || '')}" placeholder="Ex.: Limpar as galerias e os bueiros"></label>
        <label><span>Acompanhar pelo compromisso</span><select name="meta">${opcoesMeta(a.meta)}</select></label>
        <button type="button" class="szc-tirar" data-tirar aria-label="Tirar ação">${ic('x')}</button>
      </li>`;

    function editor(rota) {
      const nova = rota.temporada === 'nova';
      const base = nova ? (rota.base ? reg().buscar(rota.base) : null) : reg().buscar(rota.temporada);
      if (!nova && !base) { lista(); return; }
      const t = nova
        ? Object.assign({ area: (GC.data.areas || [])[0].id, icone: 'calendar-event', camada: null, preparo: 2, porque: '', cidadao: '', acoes: [{ texto: '' }], marco: { de: 'jan', ate: 'jan' } },
          base ? JSON.parse(JSON.stringify(base)) : {}, { nome: base ? `${base.nome} (cópia)` : '', fabrica: false, alterado: false })
        : base;
      const so = pode() ? '' : ' disabled';
      const series = GC.seriesSazonal();
      const icones = GC.ICONES_SAZONAL.includes(t.icone) ? GC.ICONES_SAZONAL : [t.icone, ...GC.ICONES_SAZONAL];
      const titulo = nova ? (base ? `Nova temporada a partir de "${esc(base.nome)}"` : 'Nova temporada') : `${ic(t.icone)} ${esc(t.nome)}`;
      el.innerHTML = `
        <nav class="szc-nav"><button type="button" class="sz-link" data-voltar-lista>${ic('arrow-left')} Configurar o calendário</button></nav>
        <form class="szc-form" novalidate>
          <header class="sec-topo"><div>
            <h2>${titulo}</h2>
            ${t.fabrica ? `<p>${t.alterado ? 'Temporada padrão alterada: "Voltar ao padrão" desfaz as mudanças.' : 'Temporada padrão do sistema.'}</p>` : ''}
          </div></header>

          <div class="szc-grade">
            <section class="rel-cartao">
              <h3>A temporada</h3>
              <label class="szc-campo"><span>Nome</span><input name="nome" maxlength="${GC.LIMITES_SAZONAL.nome}" value="${esc(t.nome)}" placeholder="Ex.: Chuvas de verão" required${so}></label>
              <label class="szc-campo"><span>Secretaria responsável</span><select name="area"${so}>${(GC.data.areas || []).map((a) => `<option value="${esc(a.id)}"${a.id === t.area ? ' selected' : ''}>${esc(a.nome)}</option>`).join('')}</select></label>
              <fieldset class="szc-icones"><legend>Ícone</legend>
                ${icones.map((n) => `<label title="${esc(n)}"><input type="radio" name="icone" value="${esc(n)}"${n === t.icone ? ' checked' : ''}${so}>${ic(n)}</label>`).join('')}
              </fieldset>
              <label class="szc-campo"><span>"Ver no mapa" liga a camada</span><select name="camada"${so}><option value="">Nenhuma</option>${GC.CAMADAS_SAZONAL.map(([c, n]) => `<option value="${c}"${c === t.camada ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select></label>
            </section>

            <section class="rel-cartao">
              <h3>Quando acontece</h3>
              <fieldset class="szc-quando">
                <label class="szc-opcao"><input type="radio" name="quando" value="serie"${t.serie ? ' checked' : ''}${series.length ? '' : ' disabled'}${so}>
                  <span><b>Pela série de uma secretaria</b><small>Os meses e o pico saem do histórico: conta o mês com ao menos ${Math.round(GC.sazonal.LIMIAR * 100)}% do pior valor.</small></span></label>
                <div class="szc-sub" data-quando="serie">
                  <label class="szc-campo"><span>Série</span><select name="serie"${so}>${series.map((s) => `<option value="${esc(s.caminho)}"${s.caminho === t.serie ? ' selected' : ''}>${esc(s.rotulo)}</option>`).join('')}</select></label>
                  <label class="szc-campo"><span>O pior é</span><select name="ruim"${so}><option value="alto"${t.ruim !== 'baixo' ? ' selected' : ''}>o valor alto</option><option value="baixo"${t.ruim === 'baixo' ? ' selected' : ''}>o valor baixo</option></select></label>
                </div>
                <label class="szc-opcao"><input type="radio" name="quando" value="marco"${t.serie ? '' : ' checked'}${so}>
                  <span><b>Data conhecida</b><small>Época do calendário da cidade, sem série na base (sem intensidade nem pico).</small></span></label>
                <div class="szc-sub" data-quando="marco">
                  <label class="szc-campo"><span>Começa em</span><select name="de"${so}>${opcoesMes(t.marco ? t.marco.de : 'jan')}</select></label>
                  <label class="szc-campo"><span>Termina em</span><select name="ate"${so}>${opcoesMes(t.marco ? t.marco.ate : 'jan')}</select></label>
                </div>
              </fieldset>
              <label class="szc-campo szc-curto"><span>Começar a preparar</span><select name="preparo"${so}>${Array.from({ length: GC.LIMITES_SAZONAL.preparoMax + 1 }, (_, n) => `<option value="${n}"${n === t.preparo ? ' selected' : ''}>${n === 0 ? 'no próprio mês' : `${plural(n, 'mês', 'meses')} antes`}</option>`).join('')}</select></label>
              <div class="szc-previa"><span class="szc-meses" aria-hidden="true">${meses()}</span><div data-previa></div><p class="szc-previa-txt" data-previa-txt aria-live="polite"></p></div>
            </section>
          </div>

          <section class="rel-cartao">
            <h3>Por quê e o que dizer ao cidadão</h3>
            <label class="szc-campo"><span>Por causa de…</span><input name="porque" maxlength="${GC.LIMITES_SAZONAL.porque}" value="${esc(t.porque || '')}" placeholder="Ex.: alagamentos e deslizamentos nas áreas de risco"${so}></label>
            <label class="szc-campo"><span>Dica ao cidadão (opcional: aparece no Portal do Cidadão e no site da Prefeitura; {tel} vira o telefone)</span><textarea name="cidadao" rows="3" maxlength="${GC.LIMITES_SAZONAL.cidadao}"${so}>${esc(t.cidadao || '')}</textarea></label>
          </section>

          <section class="rel-cartao">
            <h3>O que fazer <small>até ${GC.LIMITES_SAZONAL.acoes} ações; o compromisso liga a ação ao progresso do plano de governo</small></h3>
            <ul class="szc-acoes" data-acoes>${(t.acoes.length ? t.acoes : [{}]).map(linhaAcao).join('')}</ul>
            ${pode() ? `<button type="button" class="btn-sec szc-mais" data-mais>${ic('plus')} Ação</button>` : ''}
          </section>

          <p class="szc-erro" role="alert" hidden></p>
          ${pode() ? `<div class="szc-botoes">
            <button type="submit" class="btn-primario">${nova ? 'Criar temporada' : 'Salvar'}</button>
            <button type="button" class="btn-sec" data-voltar-lista>Cancelar</button>
            <span class="szc-espaco"></span>
            ${!nova && t.fabrica && t.alterado ? `<button type="button" class="btn-sec" data-restaurar-esta>${ic('refresh')} Voltar ao padrão</button>` : ''}
            ${!nova ? `<button type="button" class="btn-sec szc-perigo" data-excluir>${ic('trash')} Remover</button>` : ''}
          </div>` : ''}
        </form>`;

      const form = el.querySelector('form');
      const erro = form.querySelector('.szc-erro');
      const mostrarErro = (motivo) => { erro.textContent = ERROS[motivo] || 'Não deu para salvar a temporada.'; erro.hidden = false; erro.scrollIntoView({ block: 'nearest' }); };
      if (!pode()) form.querySelectorAll('input, select, textarea, [data-tirar]').forEach((x) => { x.disabled = true; });

      const ler = () => {
        const quando = form.querySelector('[name="quando"]:checked').value;
        return Object.assign({
          nome: form.nome.value, area: form.area.value,
          icone: (form.querySelector('[name="icone"]:checked') || {}).value,
          camada: form.camada.value || null, preparo: Number(form.preparo.value),
          porque: form.porque.value, cidadao: form.cidadao.value,
          acoes: [...form.querySelectorAll('[data-acao]')].map((li) => {
            const v = li.querySelector('[name="meta"]').value;
            const i = v.indexOf('|');
            return { texto: li.querySelector('[name="acao"]').value, meta: v ? { area: v.slice(0, i), titulo: v.slice(i + 1) } : null };
          }),
        }, quando === 'serie' ? { serie: form.serie.value, ruim: form.ruim.value } : { marco: { de: form.de.value, ate: form.ate.value } });
      };

      // Mostra só os campos do jeito escolhido e redesenha a prévia com a mesma conta do calendário.
      function atualizarPrevia() {
        const d = ler();
        form.querySelectorAll('[data-quando]').forEach((s) => { s.hidden = s.dataset.quando !== (d.serie ? 'serie' : 'marco'); });
        const p = GC.sazonal.previa({ id: 'previa', nome: d.nome, area: d.area, icone: d.icone, serie: d.serie, ruim: d.ruim, marco: d.marco, preparo: d.preparo, porque: d.porque });
        form.querySelector('[data-previa]').innerHTML = faixa(p);
        form.querySelector('[data-previa-txt]').textContent = p
          ? `${GC.sazonal.periodo(p)}${p.pico !== null ? `, pico em ${GC.sazonal.NOMES_MES[p.pico]}` : ''}${p.preparo.length ? `; preparar em ${p.preparo.map((m) => GC.sazonal.CURTOS[m]).join(', ')}` : ''}.`
          : '';
      }
      atualizarPrevia();
      form.addEventListener('change', atualizarPrevia);

      el.querySelectorAll('[data-voltar-lista]').forEach((b) => { b.onclick = () => cb.ir({ tela: 'sazonal', config: true }); });
      form.addEventListener('click', (ev) => {
        const b = ev.target.closest('button');
        if (!b || !pode()) return;
        if (b.hasAttribute('data-tirar')) {
          const lista = form.querySelector('[data-acoes]');
          if (lista.children.length > 1) b.closest('li').remove();
          else b.closest('li').querySelector('[name="acao"]').value = '';
        }
        if (b.hasAttribute('data-mais')) {
          const lista = form.querySelector('[data-acoes]');
          if (lista.children.length >= GC.LIMITES_SAZONAL.acoes) { mostrarErro('acoes_demais'); return; }
          lista.insertAdjacentHTML('beforeend', linhaAcao());
          lista.lastElementChild.querySelector('input').focus();
        }
      });
      form.onsubmit = (ev) => {
        ev.preventDefault();
        if (!pode()) return;
        const dados = ler();
        const r = nova ? cb.aoCriar(rota.base || null, dados) : cb.aoSalvar(t.id, dados);
        if (!r || !r.ok) { mostrarErro(r && r.motivo); return; }
        cb.ir({ tela: 'sazonal', config: true });
      };
      const restaurar = form.querySelector('[data-restaurar-esta]');
      if (restaurar) restaurar.onclick = () => { const r = cb.aoRestaurar(t.id); if (r && r.ok) editor(rota); else mostrarErro(r && r.motivo); };
      const excluir = form.querySelector('[data-excluir]');
      if (excluir) {
        excluir.onclick = async () => {
          const ok = GC.confirmar
            ? await GC.confirmar({ titulo: `Remover "${t.nome}" do calendário?`, texto: `A temporada sai do calendário, do widget, da Maia e do Portal do Cidadão.${t.fabrica ? ' Dá para restaurar depois na lista.' : ''}`, sim: 'Remover', perigo: true })
            : window.confirm(`Remover "${t.nome}" do calendário?`);
          if (!ok) return;
          const r = cb.aoExcluir(t.id);
          if (r && r.ok) cb.ir({ tela: 'sazonal', config: true }); else mostrarErro(r && r.motivo);
        };
      }
    }

    // Cliques da lista (a lista se redesenha; o editor liga os dele).
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-szc-lista] button');
      if (!b || !rotaAtual || rotaAtual.temporada) return;
      if (b.hasAttribute('data-voltar')) cb.ir({ tela: 'sazonal' });
      else if (b.dataset.ir) cb.ir({ tela: 'sazonal', config: true, temporada: b.dataset.ir });
      else if (b.dataset.duplicar) cb.ir({ tela: 'sazonal', config: true, temporada: 'nova', base: b.dataset.duplicar });
      else if (b.hasAttribute('data-nova')) cb.ir({ tela: 'sazonal', config: true, temporada: 'nova' });
      else if (b.dataset.restaurar) { cb.aoRestaurar(b.dataset.restaurar); lista(); }
    });

    // O retrato da lista: a tela só se redesenha sozinha quando ele muda (desfazer, outra aba).
    const retrato = () => JSON.stringify([reg().lista(), reg().removidas().map((t) => t.id), pode()]);
    let ultimo = null;
    let rotaAtual = null;
    function mostrar(rota) {
      rotaAtual = rota || { tela: 'sazonal', config: true };
      ultimo = retrato();
      if (rotaAtual.temporada) editor(rotaAtual); else lista();
    }
    // A cada render do app: a lista acompanha; o editor aberto não é trocado (pode haver texto digitado).
    function atualizar(rota) {
      if (rota && rota.temporada) return;
      if (retrato() !== ultimo) mostrar(rota);
    }
    return { mostrar, atualizar };
  };
})(window.GC = window.GC || {});
