(function (GC) {
  // Minha visão (revisão de 23/11): cada pessoa monta o próprio painel.
  //   - Modelo: Completa, Resumida ou Foco (atalhos); mexeu em qualquer coisa, vira "Personalizada".
  //   - Arrumação: Padrão (o layout de sempre) ou Foco (uma coluna, números grandes, menu com nomes e, no mapa,
  //     o Resumo de hoje preso numa coluna ao lado). É a mudança de layout da visão reduzida.
  //   - Mapa ao abrir: completo (filtros, camadas, widgets) ou simples (o Resumo de hoje).
  //   - Tela inicial, telas do menu, blocos de cada tela (js/resumo-telas.js) e tamanho do texto (js/tamanho-texto.js).
  // O perfil manda por cima: quem é "só resumida" (GC.EXIBICOES) personaliza, mas não abre os blocos de detalhe
  // nem o mapa completo. Fica neste navegador, por usuário (gc.minha-visao.<usuário>).
  const ic = (n) => `<i class="ti ti-${n}" aria-hidden="true"></i>`;
  const esc = (t) => (GC.escaparHtml ? GC.escaparHtml(t) : String(t));
  const chave = () => {
    let u = null;
    try { u = typeof GC.usuarioAtual === 'function' ? GC.usuarioAtual() : null; } catch (e) { u = null; }
    return `gc.minha-visao.${u ? u.id : 'demo'}`;
  };
  const ler = () => { try { return JSON.parse(localStorage.getItem(chave())); } catch (e) { return null; } };
  const gravar = (v) => { try { localStorage.setItem(chave(), JSON.stringify(v)); } catch (e) { /* vale até recarregar */ } };

  const exibicao = () => (GC.visaoSimples ? GC.visaoSimples.exibicao() : 'completa');
  const forcada = () => exibicao() === 'so_resumida';
  // Telas que dá para pôr na tela inicial e tirar do menu (pela tela da rota do menu).
  const TELAS_MENU = [
    { tela: 'crise', nome: 'Gabinete de crise', hash: '#/crise' },
    { tela: 'secretarias', nome: 'Secretarias', hash: '#/secretarias' },
    { tela: 'relatorios', nome: 'Relatórios', hash: '#/relatorios/executivo/-/30' },
    { tela: 'cruzamento', nome: 'Cruzamento de dados', hash: '#/cruzamento' },
    { tela: 'sazonal', nome: 'Calendário sazonal', hash: '#/sazonal' },
    { tela: 'entregas', nome: 'Agenda de entregas', hash: '#/entregas' },
    { tela: 'metas', nome: 'Plano de governo', hash: '#/metas' },
    { tela: 'orcamento', nome: 'Orçamento', hash: '#/orcamento' },
    { tela: 'tarefas', nome: 'Demandas', hash: '#/tarefas' },
    { tela: 'publicacoes', nome: 'Agenda de publicação', hash: '#/publicacoes' },
  ];
  const MODELOS = {
    completa: { nome: 'Completa', desc: 'Tudo à vista: filtros, camadas, tabelas e gráficos.', icone: 'layout-grid', valores: { arrumacao: 'padrao', mapa: 'completo', blocos: {}, texto: 0 } },
    resumida: { nome: 'Resumida', desc: 'O mesmo layout, só com o essencial de cada tela.', icone: 'layout-rows', valores: { arrumacao: 'padrao', mapa: 'simples', blocos: {}, texto: 0 } },
    foco: { nome: 'Foco', desc: 'Uma coluna, números grandes, menu com nomes e letra maior.', icone: 'focus-centered', valores: { arrumacao: 'foco', mapa: 'simples', blocos: {}, texto: 1 } },
  };

  function padrao() {
    const ex = exibicao();
    return { arrumacao: 'padrao', mapa: ex === 'completa' ? 'completo' : 'simples', inicio: 'painel', ocultas: [], blocos: {} };
  }
  function config() {
    const c = Object.assign(padrao(), ler() || {});
    if (forcada()) c.mapa = 'simples';
    return c;
  }
  const textoAtual = () => (GC.tamanhoTexto ? GC.tamanhoTexto.nivel() : 0);
  function definir(parcial) { gravar(Object.assign(config(), parcial)); }

  const base = () => (forcada() || config().mapa === 'simples' ? 'resumida' : 'completa');
  const blocoDe = (tela, id) => (((GC.resumoTelas && GC.resumoTelas.TELAS[tela]) || {}).blocos || []).find((b) => b.id === id) || null;
  function travado(tela, id) { const b = blocoDe(tela, id); return !!(b && forcada() && b.resumida === false); }
  function blocoPadrao(tela, id, comBase) { const b = blocoDe(tela, id); return !b || (comBase || base()) !== 'resumida' || b.resumida !== false; }
  function blocoVisivel(tela, id) {
    if (travado(tela, id)) return false;
    const o = ((config().blocos || {})[tela] || {})[id];
    return typeof o === 'boolean' ? o : blocoPadrao(tela, id);
  }
  // Qual modelo a configuração atual é (ou "personalizada").
  function modelo(c = config(), texto = textoAtual()) {
    const semBlocos = !Object.values(c.blocos || {}).some((t) => Object.keys(t || {}).length);
    const achou = Object.entries(MODELOS).find(([, m]) => m.valores.arrumacao === c.arrumacao && m.valores.mapa === c.mapa && m.valores.texto === texto && semBlocos && !(c.ocultas || []).length);
    return achou ? achou[0] : 'personalizada';
  }
  const rotuloModelo = () => { const m = modelo(); return m === 'personalizada' ? 'Visão personalizada' : `Visão ${MODELOS[m].nome.toLowerCase()}`; };

  function aplicarArrumacao() {
    document.documentElement.classList.toggle('arr-foco', config().arrumacao === 'foco');
  }

  // Tela inicial: só quando o painel abre sem endereço de tela (#/painel ou nada).
  function irParaInicio() {
    const c = config();
    if (!c.inicio || c.inicio === 'painel') return;
    const h = String(location.hash || '');
    if (h && h !== '#' && h !== '#/') return;
    const t = TELAS_MENU.find((x) => x.tela === c.inicio);
    if (t) history.replaceState(null, '', `${location.pathname}${location.search}${t.hash}`);
  }

  // ---------- o painel "Minha visão" ----------
  let dlg = null;
  let rascunho = null;
  let textoRascunho = 0;
  function htmlDialogo(focarTela) {
    const c = rascunho;
    const m = modelo(c, textoRascunho);
    const tr = forcada();
    const telasBlocos = Object.entries((GC.resumoTelas && GC.resumoTelas.TELAS) || {});
    const visRascunho = (tela, id) => {
      if (travado(tela, id)) return false;
      const o = ((c.blocos || {})[tela] || {})[id];
      return typeof o === 'boolean' ? o : blocoPadrao(tela, id, tr || c.mapa === 'simples' ? 'resumida' : 'completa');
    };
    const opc = (nome, valor, atual, rot, desc, icone, extra = '') => `<label class="mv-opcao${atual === valor ? ' ativa' : ''}${extra}">
        <input type="radio" name="${nome}" value="${valor}"${atual === valor ? ' checked' : ''}${extra.includes('travada') ? ' disabled' : ''}>
        ${icone ? `<span class="mv-op-ic">${ic(icone)}</span>` : ''}<span><b>${esc(rot)}</b><small>${esc(desc)}</small></span></label>`;
    return `<form method="dialog" class="mv-form">
      <header class="mv-cab"><div><p class="mv-rotulo">Só para você · ${esc(GC.perfilRotulo ? GC.perfilRotulo() : '')}</p><h2 id="mv-titulo">${ic('adjustments-horizontal')} Minha visão</h2></div>
        <button type="button" class="gaveta-x" data-mv="fechar" aria-label="Fechar">${ic('x')}</button></header>
      ${tr ? `<p class="mv-aviso">${ic('lock')} O seu perfil abre sempre na visão resumida. Você pode arrumar a tela, o menu e o texto; os detalhes que o perfil não mostra ficam travados.</p>` : ''}
      <section class="mv-sec"><h3>Comece por um modelo</h3>
        <div class="mv-modelos">${Object.entries(MODELOS).map(([id, x]) => `<button type="button" class="mv-modelo${m === id ? ' ativo' : ''}" data-mv-modelo="${id}"${tr && id === 'completa' ? ' disabled title="O seu perfil não abre na visão completa"' : ''}>
            <span class="mv-mini mv-mini-${id}" aria-hidden="true"><i></i><i></i><i></i><i></i></span><b>${ic(x.icone)} ${esc(x.nome)}</b><small>${esc(x.desc)}</small></button>`).join('')}</div>
        <p class="mv-atual">Agora: <b>${m === 'personalizada' ? 'Personalizada' : esc(MODELOS[m].nome)}</b>${m === 'personalizada' ? ' (você mexeu nos itens abaixo)' : ''}</p>
      </section>
      <section class="mv-sec"><h3>Arrumação da tela</h3>
        <div class="mv-opcoes">${opc('arrumacao', 'padrao', c.arrumacao, 'Padrão', 'O layout de sempre: várias colunas, menu só com ícones.', 'layout-dashboard')}
          ${opc('arrumacao', 'foco', c.arrumacao, 'Foco', 'Uma coluna, números grandes, menu com nomes e o resumo do dia ao lado do mapa.', 'focus-centered')}</div>
      </section>
      <section class="mv-sec"><h3>O mapa ao abrir</h3>
        <div class="mv-opcoes">${opc('mapa', 'completo', c.mapa, 'Completo', 'Filtros, camadas, visualizações e widgets sobre o mapa.', 'map-2', tr ? ' travada' : '')}
          ${opc('mapa', 'simples', c.mapa, 'Simples', 'O Resumo de hoje com o que precisa de você.', 'sun')}</div>
      </section>
      <section class="mv-sec mv-duas"><div><h3>Tela inicial</h3>
          <select name="inicio" class="mv-select"><option value="painel"${c.inicio === 'painel' ? ' selected' : ''}>Mapa</option>${TELAS_MENU.map((t) => `<option value="${t.tela}"${c.inicio === t.tela ? ' selected' : ''}>${esc(t.nome)}</option>`).join('')}</select></div>
        <div><h3>Tamanho do texto</h3><div class="mv-texto" role="group" aria-label="Tamanho do texto">${[0, 1, 2].map((n) => `<button type="button" data-mv-texto="${n}" aria-pressed="${textoRascunho === n}" class="tt-${n}">${['A', 'A+', 'A++'][n]}</button>`).join('')}</div></div>
      </section>
      <section class="mv-sec"><h3>Telas no menu</h3><p class="mv-dica">Desmarque o que você não usa. O Mapa fica sempre.</p>
        <div class="mv-checks">${TELAS_MENU.map((t) => `<label class="mv-check"><input type="checkbox" name="menu" value="${t.tela}"${(c.ocultas || []).includes(t.tela) ? '' : ' checked'}> ${esc(t.nome)}</label>`).join('')}</div>
      </section>
      <section class="mv-sec"><h3>O que aparece em cada tela</h3><p class="mv-dica">Cada tela mantém o lugar das coisas; aqui você escolhe o que fica à vista.</p>
        ${telasBlocos.map(([id, t]) => `<details class="mv-tela"${focarTela === id ? ' open' : ''} data-mv-tela="${id}"><summary>${esc(t.nome)} <small>${t.blocos.filter((b) => visRascunho(id, b.id)).length} de ${t.blocos.length} à vista</small></summary>
          <div class="mv-checks">${t.blocos.map((b) => `<label class="mv-check${travado(id, b.id) ? ' travada' : ''}"><input type="checkbox" data-mv-bloco="${id}:${b.id}"${visRascunho(id, b.id) ? ' checked' : ''}${travado(id, b.id) ? ' disabled' : ''}> ${esc(b.nome)}${travado(id, b.id) ? ` ${ic('lock')}` : ''}</label>`).join('')}</div></details>`).join('')}
      </section>
      <footer class="mv-pe">
        <button type="button" class="btn-sec" data-mv="padrao">${ic('restore')} Voltar ao padrão do meu perfil</button>
        <button type="button" class="btn-sec principal" data-mv="salvar">${ic('check')} Salvar e aplicar</button>
      </footer>
    </form>`;
  }
  function redesenhar(focarTela) {
    const abertas = [...dlg.querySelectorAll('details[open]')].map((d) => d.dataset.mvTela);
    const rol = dlg.querySelector('.mv-form') ? dlg.querySelector('.mv-form').scrollTop : 0;
    dlg.innerHTML = htmlDialogo(focarTela);
    abertas.forEach((t) => { const d = dlg.querySelector(`details[data-mv-tela="${t}"]`); if (d) d.open = true; });
    const f = dlg.querySelector('.mv-form');
    if (f) f.scrollTop = rol;
  }
  function lerForm() {
    const f = dlg.querySelector('form');
    const val = (n) => { const x = f.querySelector(`[name="${n}"]:checked`); return x ? x.value : null; };
    rascunho.arrumacao = val('arrumacao') || rascunho.arrumacao;
    rascunho.mapa = forcada() ? 'simples' : (val('mapa') || rascunho.mapa);
    rascunho.inicio = f.querySelector('[name="inicio"]').value;
    rascunho.ocultas = [...f.querySelectorAll('[name="menu"]')].filter((x) => !x.checked).map((x) => x.value);
    const blocos = {};
    const baseR = forcada() || rascunho.mapa === 'simples' ? 'resumida' : 'completa';
    f.querySelectorAll('[data-mv-bloco]').forEach((x) => {
      const [tela, id] = x.dataset.mvBloco.split(':');
      if (x.disabled) return;
      if (x.checked !== blocoPadrao(tela, id, baseR)) { blocos[tela] = blocos[tela] || {}; blocos[tela][id] = x.checked; }
    });
    rascunho.blocos = blocos;
  }
  function abrir(focarTela) {
    if (!dlg) {
      dlg = document.createElement('dialog');
      dlg.id = 'minha-visao';
      dlg.className = 'mv-dialogo';
      dlg.setAttribute('aria-labelledby', 'mv-titulo');
      document.body.appendChild(dlg);
      dlg.addEventListener('click', (e) => {
        if (e.target === dlg) { dlg.close(); return; }
        const md = e.target.closest('[data-mv-modelo]');
        if (md) {
          const v = MODELOS[md.dataset.mvModelo].valores;
          lerForm();
          Object.assign(rascunho, { arrumacao: v.arrumacao, mapa: forcada() ? 'simples' : v.mapa, blocos: {}, ocultas: [] });
          textoRascunho = v.texto;
          redesenhar();
          return;
        }
        const tx = e.target.closest('[data-mv-texto]');
        if (tx) { lerForm(); textoRascunho = Number(tx.dataset.mvTexto) || 0; redesenhar(); return; }
        const a = e.target.closest('[data-mv]');
        if (!a) return;
        if (a.dataset.mv === 'fechar') dlg.close();
        if (a.dataset.mv === 'padrao') { try { localStorage.removeItem(chave()); } catch (er) { /* nada */ } if (GC.tamanhoTexto) GC.tamanhoTexto.definir(0); location.reload(); }
        if (a.dataset.mv === 'salvar') {
          lerForm();
          const antes = config();
          gravar(rascunho);
          if (GC.tamanhoTexto) GC.tamanhoTexto.definir(textoRascunho);
          if (GC.auditar) GC.auditar('minha_visao', { alvo: modelo(rascunho, textoRascunho), detalhe: `Arrumação ${rascunho.arrumacao}, mapa ${rascunho.mapa}` });
          // Menu, mapa e tela inicial são montados na abertura: recarrega. O resto aplica na hora.
          const recarregar = antes.mapa !== rascunho.mapa || JSON.stringify(antes.ocultas || []) !== JSON.stringify(rascunho.ocultas) || antes.arrumacao !== rascunho.arrumacao;
          if (recarregar) { location.reload(); return; }
          aplicarArrumacao();
          if (GC.resumoTelas) GC.resumoTelas.reaplicarTudo();
          dlg.close();
        }
      });
      dlg.addEventListener('change', () => { lerForm(); redesenhar(); });
    }
    rascunho = JSON.parse(JSON.stringify(config()));
    textoRascunho = textoAtual();
    redesenhar(focarTela);
    if (!dlg.open) { dlg.showModal(); const h = dlg.querySelector('h2'); if (h) { h.tabIndex = -1; h.focus(); } }
    const alvo = focarTela && dlg.querySelector(`details[data-mv-tela="${focarTela}"]`);
    if (alvo) setTimeout(() => alvo.scrollIntoView({ block: 'start' }), 30);
  }

  GC.minhaVisao = {
    config, definir, modelo, rotuloModelo, blocoVisivel, travado, abrir, aplicarArrumacao, TELAS_MENU, MODELOS,
    salva: () => ler(),
    ocultaNoMenu: (tela) => tela !== 'painel' && (config().ocultas || []).includes(tela),
    mapaSimples: () => config().mapa === 'simples',
  };
  aplicarArrumacao();
  irParaInicio();
  // Entrada no menu ⋯ (grupo "Leitura", montado por js/tamanho-texto.js) e no pé do menu lateral (js/dashboard.js).
  function montarEntradas() {
    const menu = document.getElementById('menu-mais');
    if (menu && !menu.querySelector('#btn-minha-visao')) {
      const b = document.createElement('button');
      b.type = 'button';
      b.id = 'btn-minha-visao';
      b.className = 'item-mais';
      b.innerHTML = `${ic('adjustments-horizontal')} Minha visão <small class="mv-chip">${esc(rotuloModelo().replace('Visão ', ''))}</small>`;
      b.addEventListener('click', () => abrir());
      const g = menu.querySelector('.mais-leitura-grupo');
      if (g) g.insertBefore(b, g.querySelector('.mais-leitura')); else menu.insertBefore(b, menu.querySelector('.mais-demo'));
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(montarEntradas, 0));
  else setTimeout(montarEntradas, 0);
})(window.GC = window.GC || {});
