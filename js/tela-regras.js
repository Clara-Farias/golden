(function (GC) {
  // Tela "Regras de alerta" (#/regras) e editor (#/regras/<id>, #/regras/nova, #/regras/nova/<base> para duplicar).
  // As regras vêm de js/regras-alerta.js; quem pode o quê, de GC.podeNaRegra (js/perfil.js). A tela só desenha
  // e chama as ações de js/app/telas.js, que gravam e auditam.
  // Spec: docs/specs/2026-11-12-vila-dourada-regras-de-alerta-design.md (fase 2).
  const esc = (t) => GC.escaparHtml(t);
  const SEV = { critica: 'Crítica', alta: 'Alta', media: 'Média' };
  const OPS = [['>', 'acima de'], ['>=', 'pelo menos'], ['<', 'abaixo de'], ['<=', 'no máximo'], ['=', 'igual a']];
  const ORIGENS = [['', 'Todas as origens'], ['padrao', 'Do sistema'], ['personalizada', 'Criadas por vocês'], ['maia', 'Da Maia']];
  const MOTIVOS = {
    nome: 'Dê um nome à regra (até 120 letras).',
    tipo: 'Escolha o tipo de ocorrência que a regra dispara.',
    condicao: 'Confira as condições: cada uma precisa do que medir e, quando for número, de um valor.',
    bairros: 'Escolha ao menos um bairro, ou marque "Cidade inteira".',
    gravidade: 'Confira a gravidade e as subidas.',
    prazo: 'O prazo vai de 10 minutos a 30 dias.',
    prazo_solucao: 'O prazo para resolver vai de 1 hora a 90 dias e não pode ser menor que o de pôr equipe em campo.',
    medir: 'Para disparar sozinha, todas as condições precisam ser medidas pela mesma fonte de dados.',
    escalonamento: 'Confira o escalonamento: até 3 degraus, de 5 minutos a 30 dias.',
    silencio: 'Confira o silêncio: intervalo de 5 minutos a 7 dias e raio de 10 m a 5 km.',
    atencao: 'Confira os limites: caso repetido de 1 a 99 chamados e "quase estourando" de 10% a 99%.',
    permissao: 'O seu perfil não pode mudar esta regra.',
    padrao: 'Regra do sistema não se exclui: dá para pausar ou restaurar o padrão.',
    nao_encontrada: 'Essa regra não existe mais.',
  };
  const copia = (v) => JSON.parse(JSON.stringify(v));
  const maiuscula = (t) => (t ? t.charAt(0).toUpperCase() + t.slice(1) : '');
  const hora = (t) => { const d = new Date(t); return `${String(d.getHours()).padStart(2, '0')}h${String(d.getMinutes()).padStart(2, '0')}`; };
  const metrica = (id) => GC.METRICAS_ALERTA.find((m) => m.id === id);

  // opcoes: { estado(), aoIr(rota), aoSalvar(id, mudancas), aoCriar(dados), aoExcluir(id), aoRegra(id, acao, dados),
  //           aoSalvarAtencao(limites), aoRestaurarAtencao() }
  GC.criarTelaRegras = function (el, opcoes) {
    const f = { texto: '', area: '', origem: '', situacao: 'todas' };
    let rota = { tela: 'regras', id: null };
    let estado = null;
    let aviso = null; // { texto, erro }
    let form = null; // cópia de trabalho do editor
    let original = null; // como a regra estava ao abrir o editor (para saber se mudou)
    let teste = null; // resultado do "Testar nos últimos 30 dias"

    const nomeArea = (a) => ((estado.areas.find((x) => x.id === a) || {}).nome || '');
    const pode = (acao, r) => estado.podeRegra(acao, r);
    // aviso.voltar: id da regra que acabou de ser pausada pela chave (oferece a volta sozinha, opcional).
    const VOLTAS = [[60, '1 h'], [240, '4 h'], [1440, '24 h']];
    const avisoHtml = () => (aviso ? `<p class="rg-aviso${aviso.erro ? ' rg-aviso-erro' : ''}" role="status"><i class="ti ti-${aviso.erro ? 'alert-triangle' : 'circle-check'}" aria-hidden="true"></i> <span>${esc(aviso.texto)}</span>${aviso.voltar
      ? `<span class="rg-aviso-acoes" role="group" aria-label="Fazer a regra voltar sozinha">Voltar sozinha em ${VOLTAS.map(([m, n]) => `<button type="button" class="chip-filtro" data-voltar="${m}" data-regra="${esc(aviso.voltar)}">${n}</button>`).join('')}</span>` : ''}</p>` : '');

    function situacaoDe(r) {
      if (r.rascunho) return { classe: 'rg-sit-rascunho', texto: 'Rascunho' };
      if (r.pausa) return { classe: 'rg-sit-pausada', texto: `Pausada ${r.pausa.ate ? `até ${hora(r.pausa.ate)}` : 'até reativar'}` };
      return { classe: 'rg-sit-ativa', texto: 'Ativa' };
    }
    const selos = (r) => [
      r.origem === 'maia' ? '<span class="rel-etq t-ok">da Maia</span>' : r.origem === 'personalizada' ? '<span class="rel-etq">criada por vocês</span>' : '',
      r.modificada ? `<span class="rel-etq" title="Mudou do padrão do sistema">modificada · v${r.versao}</span>` : '',
    ].join(' ');
    const ondeTexto = (bairros) => (bairros.length ? bairros.map((b) => (estado.bairros.find((x) => x.id === b) || { nome: b }).nome).join(', ') : 'Cidade inteira');

    // ---------------- lista ----------------
    const naSituacao = (r, s) => (s === 'ativas' ? r.ativa : s === 'pausadas' ? !!r.pausa : s === 'rascunhos' ? !!r.rascunho : s === 'modificadas' ? !!r.modificada : true);
    // semSituacao: a base dos números do topo (seguem busca, secretaria e origem, não a situação escolhida).
    function filtradas(semSituacao) {
      const t = f.texto.trim().toLowerCase();
      return estado.regras.filter((r) => {
        if (f.area && r.area !== f.area) return false;
        if (f.origem && r.origem !== f.origem) return false;
        if (!semSituacao && !naSituacao(r, f.situacao)) return false;
        return !t || [r.nome, r.palavras, r.tipo || '', nomeArea(r.area)].join(' ').toLowerCase().includes(t);
      });
    }
    const filtrando = () => !!(f.texto.trim() || f.area || f.origem || f.situacao !== 'todas');

    function desenharLista() {
      const { setor } = estado;
      const podeCriar = setor ? pode('criar', { area: setor }) : pode('criar', { area: '*' });
      el.innerHTML = `
        <header class="sec-topo"><div><h2>🔔 Regras de alerta</h2>
          <p>${setor ? `O que faz um alerta da ${esc(nomeArea(setor))} nascer, com que gravidade e prazo.` : 'O que faz cada alerta nascer, onde vale, com que gravidade e com que prazo.'}</p></div>
          <span class="sec-acoes"><a class="btn-sec" href="#/prazos"><i class="ti ti-clock-cog" aria-hidden="true"></i> Parâmetros de prazo</a>${podeCriar ? '<a class="btn-primario rg-nova" href="#/regras/nova"><i class="ti ti-plus" aria-hidden="true"></i> Nova regra</a>' : ''}</span></header>
        ${avisoHtml()}
        <div class="rg-kpis" role="group" aria-label="Situação das regras"></div>
        <form class="rel-cartao au-filtros rg-filtros" role="search" aria-label="Filtrar regras">
          <div class="au-linha">
            <label class="au-busca"><i class="ti ti-search" aria-hidden="true"></i><input type="search" name="texto" value="${esc(f.texto)}" placeholder="Buscar regra…" aria-label="Buscar regra"></label>
            ${setor ? '' : `<label>Secretaria<select name="area"><option value="">Todas</option>${estado.areas.map((a) => `<option value="${esc(a.id)}">${esc(a.nome)}</option>`).join('')}</select></label>`}
            <label>Origem<select name="origem">${ORIGENS.map(([v, n]) => `<option value="${v}">${n}</option>`).join('')}</select></label>
            <button type="button" class="au-limpar" hidden><i class="ti ti-x" aria-hidden="true"></i> Limpar filtros</button>
          </div>
        </form>
        <section class="rel-cartao rg-lista" aria-live="polite"></section>
        ${cartaoLimites()}`;
      const fm = el.querySelector('.rg-filtros');
      fm.onsubmit = (ev) => ev.preventDefault();
      fm.texto.oninput = () => { f.texto = fm.texto.value; desenharTabela(); };
      if (fm.area) { fm.area.value = f.area; fm.area.onchange = () => { f.area = fm.area.value; desenharTabela(); }; }
      fm.origem.value = f.origem;
      fm.origem.onchange = () => { f.origem = fm.origem.value; desenharTabela(); };
      el.querySelector('.rg-kpis').onclick = (ev) => {
        const b = ev.target.closest('[data-situacao]');
        if (!b) return;
        f.situacao = b.dataset.situacao === f.situacao ? 'todas' : b.dataset.situacao;
        desenharTabela();
      };
      fm.querySelector('.au-limpar').onclick = () => {
        Object.assign(f, { texto: '', area: '', origem: '', situacao: 'todas' });
        fm.texto.value = '';
        if (fm.area) fm.area.value = '';
        fm.origem.value = '';
        desenharTabela();
        fm.texto.focus();
      };
      ligarLimites();
      ligarVoltas();
      desenharTabela();
    }

    // Números do topo: cada um filtra a lista pela situação (clicar de novo tira o filtro).
    function desenharKpis() {
      const caixa = el.querySelector('.rg-kpis');
      if (!caixa) return;
      const base = filtradas(true);
      const n = (s) => base.filter((r) => naSituacao(r, s)).length;
      const disparos = base.reduce((s, r) => s + (r.origem === 'padrao' && !r.rascunho ? r.disparos30d : 0), 0);
      const kpi = (s, rot, v, dica, cls = '') => {
        const ligado = f.situacao === s;
        return `<button type="button" class="rel-numero au-kpi rg-kpi ${cls}" data-situacao="${s}" aria-pressed="${ligado}">
          <small>${rot}</small><b>${v}</b><span class="rg-kpi-dica">${ligado && s !== 'todas' ? '<i class="ti ti-x" aria-hidden="true"></i> Tirar o filtro' : dica}</span></button>`;
      };
      const pausadas = n('pausadas');
      const rascunhos = n('rascunhos');
      caixa.innerHTML = [
        kpi('todas', 'Regras', base.length, `${disparos} disparo${disparos === 1 ? '' : 's'} em 30 dias`),
        kpi('ativas', 'Ativas', n('ativas'), 'disparando alertas'),
        kpi('pausadas', 'Pausadas', pausadas, pausadas ? 'alertas ficam retidos' : 'nenhuma fora do ar', pausadas ? 'rg-kpi-alerta' : ''),
        kpi('rascunhos', 'Rascunhos', rascunhos, rascunhos ? 'esperando revisão' : 'nada para revisar', rascunhos ? 'rg-kpi-alerta' : ''),
        kpi('modificadas', 'Modificadas', n('modificadas'), 'mudaram do padrão'),
      ].join('');
    }

    // "O que vai para Precisam de você": limites da cidade (GC.limitesAtencao). Só o gestor geral muda.
    let limitesAberto = false;
    function resumoLimites(a) {
      const gs = a.recorrenteGravidades.map((g) => SEV[g].toLowerCase());
      return [
        'prazo estourado',
        'escalada por regra',
        a.antecipar !== false ? `vai estourar (a partir de ${a.quasePct}% do prazo)` : '',
        a.conjunta ? 'mais de uma secretaria' : '',
        gs.length ? `caso repetido: ${a.recorrenteMin} ou mais chamados da secretaria no bairro em 30 dias (${gs.join(' e ')})` : '',
      ].filter(Boolean).join(' · ');
    }
    function cartaoLimites() {
      const a = estado.atencao;
      const podeMudar = estado.podeLimites;
      const padrao = JSON.stringify([a.recorrenteMin, a.recorrenteGravidades, a.conjunta, a.quasePct, a.antecipar !== false]) === JSON.stringify([6, ['critica', 'alta'], true, 75, true]);
      return `<details class="rel-cartao rg-limites"${limitesAberto ? ' open' : ''}>
        <summary><i class="ti ti-chevron-right rg-seta" aria-hidden="true"></i><b>O que vai para “Precisam de você”</b><small>${esc(resumoLimites(a))}${padrao ? '' : ' · <span class="rel-etq">mudado</span>'}</small></summary>
        <form class="rg-limites-form" novalidate><fieldset class="rg-tudo"${podeMudar ? '' : ' disabled'}>
          <p class="rg-dica">Prazo estourado e alerta escalado por regra sempre entram. O resto depende destes limites, que valem para a cidade toda.</p>
          <label class="rg-linha rg-inline">Caso repetido a partir de <input type="number" name="recorrenteMin" min="1" max="99" step="1" value="${a.recorrenteMin}"> chamados da mesma secretaria no bairro em 30 dias</label>
          <div class="rg-radios" role="group" aria-label="Gravidades que contam como caso repetido"><span>Conta para:</span>${Object.entries(SEV).map(([v, n]) => `<label><input type="checkbox" name="recorrenteGravidades" value="${v}"${a.recorrenteGravidades.includes(v) ? ' checked' : ''}> ${n}</label>`).join('')}</div>
          <label class="rg-radios"><span><input type="checkbox" name="antecipar"${a.antecipar !== false ? ' checked' : ''}> Avisar antes de estourar: entra quando o alerta usa a fração do prazo da barra laranja, sem equipe em campo</span></label>
          <label class="rg-radios"><span><input type="checkbox" name="conjunta"${a.conjunta ? ' checked' : ''}> Ocorrência que envolve mais de uma secretaria</span></label>
          <label class="rg-linha rg-inline">A barra do prazo fica laranja ao usar <input type="number" name="quasePct" min="10" max="99" step="1" value="${a.quasePct}"> % do prazo</label>
        </fieldset>
        ${podeMudar ? `<div class="rg-botoes"><button type="button" class="btn-primario rg-limites-salvar">Salvar limites</button>${padrao ? '' : '<button type="button" class="btn-sec rg-limites-padrao">Voltar ao padrão</button>'}</div>`
          : '<p class="rg-dica"><i class="ti ti-lock" aria-hidden="true"></i> Só o gestor geral muda estes limites.</p>'}
        </form></details>`;
    }
    function ligarLimites() {
      const det = el.querySelector('.rg-limites');
      if (!det) return;
      det.ontoggle = () => { limitesAberto = det.open; };
      const fm = det.querySelector('form');
      fm.onsubmit = (ev) => ev.preventDefault();
      const salvar = det.querySelector('.rg-limites-salvar');
      if (salvar) {
        salvar.onclick = () => {
          const res = opcoes.aoSalvarAtencao({
            recorrenteMin: Math.round(Number(fm.recorrenteMin.value)),
            recorrenteGravidades: [...fm.querySelectorAll('input[name="recorrenteGravidades"]:checked')].map((x) => x.value),
            conjunta: fm.conjunta.checked,
            antecipar: fm.antecipar.checked,
            quasePct: Math.round(Number(fm.quasePct.value)),
          });
          aviso = res && res.ok ? { texto: 'Limites salvos. "Precisam de você" já segue os novos.' } : { texto: MOTIVOS[res && res.motivo] || 'Não foi possível salvar.', erro: true };
          estado = opcoes.estado();
          desenharLista();
          aviso = null;
        };
      }
      const padrao = det.querySelector('.rg-limites-padrao');
      if (padrao) {
        padrao.onclick = () => {
          const res = opcoes.aoRestaurarAtencao();
          aviso = res && res.ok ? { texto: 'Limites de volta ao padrão.' } : { texto: 'Não foi possível concluir.', erro: true };
          estado = opcoes.estado();
          desenharLista();
          aviso = null;
        };
      }
    }

    // Selos só do que foge do comum: o padrão (cidade inteira, gravidade da ocorrência, prazo da gravidade) não aparece.
    function selosExcecao(r) {
      const g = r.gravidade || { base: null, sobe: [] };
      const b = r.escopo.bairros;
      const nomes = b.map((id) => (estado.bairros.find((x) => x.id === id) || { nome: id }).nome);
      return [
        g.base ? `<span class="rel-etq ${g.base === 'critica' ? 't-crit' : g.base === 'alta' ? 't-at' : ''}" title="Gravidade fixa da regra">sempre ${SEV[g.base].toLowerCase()}</span>` : '',
        g.sobe && g.sobe.length ? '<span class="rel-etq" title="A gravidade sobe conforme as pessoas afetadas"><i class="ti ti-arrow-big-up-lines" aria-hidden="true"></i> sobe com afetados</span>' : '',
        r.prazoMin ? `<span class="rel-etq" title="Prazo próprio para pôr equipe em campo"><i class="ti ti-clock" aria-hidden="true"></i> equipe em ${esc(GC.tempoTexto(r.prazoMin))}</span>` : '',
        r.prazoSolucaoMin ? `<span class="rel-etq" title="Prazo próprio para resolver"><i class="ti ti-clock-check" aria-hidden="true"></i> resolver em ${esc(GC.tempoTexto(r.prazoSolucaoMin))}</span>` : '',
        b.length ? `<span class="rel-etq" title="${esc(nomes.join(', '))}"><i class="ti ti-map-pin" aria-hidden="true"></i> ${esc(nomes.slice(0, 2).join(', '))}${b.length > 2 ? ` +${b.length - 2}` : ''}</span>` : '',
      ].filter(Boolean).join(' ');
    }

    // Grupos por secretaria, na ordem de estado.areas; regras sem secretaria por último.
    function porSecretaria(lista) {
      const grupos = estado.areas.map((a) => ({ id: a.id, nome: a.nome, regras: lista.filter((r) => r.area === a.id) }));
      grupos.push({ id: '', nome: 'Sem secretaria', regras: lista.filter((r) => !r.area || !estado.areas.some((a) => a.id === r.area)) });
      return grupos.filter((g) => g.regras.length);
    }

    function desenharTabela() {
      desenharKpis();
      const limpar = el.querySelector('.au-limpar');
      if (limpar) limpar.hidden = !filtrando();
      const caixa = el.querySelector('.rg-lista');
      const lista = filtradas();
      if (!lista.length) {
        caixa.innerHTML = `<p class="au-vazio"><i class="ti ti-bell-search" aria-hidden="true"></i> Nenhuma regra com esses filtros.</p>`;
        return;
      }
      // Devoluções (js/operacao.js): a secretaria disse que a regra mandou para a pasta errada (contadas por tipo).
      const devolvidas = GC.operacao && GC.operacao.devolucoesPorTipo ? GC.operacao.devolucoesPorTipo() : {};
      const maxDisparos = Math.max(1, ...estado.regras.filter((r) => r.origem === 'padrao').map((r) => r.disparos30d || 0));
      const grupos = porSecretaria(lista);
      const agrupar = grupos.length > 1;
      const linha = (r) => {
        const s = situacaoDe(r);
        const nDev = r.origem === 'padrao' ? devolvidas[r.id] || 0 : 0;
        const dev = nDev ? `<span class="rel-etq t-at" title="Ocorrências desta regra que a secretaria devolveu por ter vindo para a pasta errada">↩ ${nDev} devolvida${nDev > 1 ? 's' : ''}</span>` : '';
        const juntas = (r.juntadas || 0) + (r.silenciadas || 0);
        const disparos = r.rascunho ? '<span class="rg-disp-n">—</span>'
          : r.origem === 'padrao'
            ? `<span class="rg-disp-n">${r.disparos30d}</span><i class="rg-disp-barra" style="--w:${Math.round(((r.disparos30d || 0) / maxDisparos) * 100)}%" aria-hidden="true"></i><small>em 30 dias</small>`
            : `<span class="rg-disp-n">${r.disparosSessao}</span><small>nesta sessão</small>`;
        const acoes = menuLinha(r);
        const situacao = r.ativa ? '' : `<span class="rg-sit ${s.classe}">${esc(s.texto)}${r.retidas ? ` · ${r.retidas} retida${r.retidas > 1 ? 's' : ''}` : ''}</span>`;
        const marcas = [situacao, selos(r), dev,
          r.escalonamento.length ? '<span class="rel-etq" title="Escala para o Gabinete ou propõe cobrança"><i class="ti ti-stairs-up" aria-hidden="true"></i> escala</span>' : '',
          r.medir ? '<span class="rel-etq t-ok" title="Dispara sozinha a partir dos dados das secretarias"><i class="ti ti-activity" aria-hidden="true"></i> mede sozinha</span>' : '',
          selosExcecao(r)].filter((x) => x && x.trim()).join(' ');
        return `<tr class="rg-linha-regra${r.ativa ? '' : ' rg-inativa'}${r.pausa ? ' rg-pausada' : ''}${r.rascunho ? ' rg-rascunho' : ''}" data-regra-item="${esc(r.id)}">
          <td class="rg-chave-cel">${chaveRegra(r)}</td>
          <td class="rg-regra"><span class="rg-nome"><b>${esc(r.nome)}</b>${marcas ? ` ${marcas}` : ''}</span><small>${esc(r.palavras || 'Sem condições ainda')}</small>${!agrupar && r.area && !estado.setor ? `<small class="rg-area">${esc(nomeArea(r.area))}</small>` : ''}${juntas ? `<small>${juntas} disparo${juntas > 1 ? 's' : ''} juntado${juntas > 1 ? 's' : ''} ou silenciado${juntas > 1 ? 's' : ''}</small>` : ''}</td>
          <td class="rg-disparos">${disparos}</td>
          <td class="us-acoes">${acoes}</td></tr>`;
      };
      const corpo = grupos.map((g) => {
        const soma = g.regras.reduce((s, r) => s + (r.origem === 'padrao' && !r.rascunho ? r.disparos30d : 0), 0);
        const cab = agrupar ? `<tr class="rg-grupo"><th scope="rowgroup" colspan="4"><span>${esc(g.nome)}</span><small>${g.regras.length} ${g.regras.length === 1 ? 'regra' : 'regras'} · ${soma} disparo${soma === 1 ? '' : 's'} em 30 dias</small></th></tr>` : '';
        return `<tbody>${cab}${g.regras.map(linha).join('')}</tbody>`;
      }).join('');
      caixa.innerHTML = `<div class="rel-tabela-wrap"><table class="sec-tabela rg-tabela">
        <caption class="so-leitor">Regras de alerta</caption>
        <thead><tr><th scope="col"><span class="so-leitor">Ligada</span></th><th scope="col">Regra</th><th scope="col" class="rg-disparos-cab">Disparos</th><th scope="col"><span class="so-leitor">Ações</span></th></tr></thead>
        ${corpo}</table></div>
        <p class="au-rodape">${lista.length} ${lista.length === 1 ? 'regra' : 'regras'} · a chave pausa ou reativa na hora; o ⋯ pausa por um tempo · clique na linha para abrir</p>`;
      ligarChaves(caixa);
      // A linha inteira abre a regra (menos nos controles dela).
      caixa.querySelectorAll('tr[data-regra-item]').forEach((tr) => {
        tr.onclick = (ev) => {
          if (ev.target.closest('a, button, input, label, select, details')) return;
          opcoes.aoIr({ tela: 'regras', id: tr.dataset.regraItem });
        };
      });
    }

    // Menu "⋯" de cada linha: abrir, duplicar, pausar (com tempo) ou reativar, restaurar o padrão.
    let redesenharDepois = false; // a lista mudou com um menu ⋯ aberto (ver atualizar)
    const PAUSAS_MENU =[[60, 'por 1 hora'], [240, 'por 4 horas'], [1440, 'por 24 horas'], [10080, 'por 7 dias'], [0, 'até reativar']];
    function menuLinha(r) {
      const podeEditar = pode('editar', r);
      const abrir = podeEditar ? (r.rascunho ? 'Revisar' : 'Editar') : 'Ver';
      const item = (ic, txt, attrs) => `<${attrs.href ? 'a' : 'button type="button"'} class="rg-menu-item" role="menuitem" ${attrs.href ? `href="${attrs.href}"` : attrs.dados}><i class="ti ${ic}" aria-hidden="true"></i> ${esc(txt)}</${attrs.href ? 'a' : 'button'}>`;
      const blocos = [
        [
          item(podeEditar ? 'ti-pencil' : 'ti-eye', abrir, { href: GC.hashDe({ tela: 'regras', id: r.id }) }),
          !r.rascunho && pode('criar', r) ? item('ti-copy', 'Duplicar', { href: GC.hashDe({ tela: 'regras', id: 'nova', base: r.id }) }) : '',
        ],
        !r.rascunho && pode('pausar', r) ? (r.pausa
          ? [item('ti-player-play', 'Reativar agora', { dados: `data-menu-reativar="${esc(r.id)}"` })]
          : [`<span class="rg-menu-tit">Pausar</span>`, ...PAUSAS_MENU.map(([m, n]) => item(m ? 'ti-clock-pause' : 'ti-player-pause', n, { dados: `data-menu-pausar="${m}" data-regra="${esc(r.id)}"` }))]) : [],
        [r.modificada && pode('restaurar', r) ? item('ti-restore', 'Restaurar o padrão', { dados: `data-restaurar="${esc(r.id)}"` }) : ''],
      ].map((b) => b.filter(Boolean).join('')).filter(Boolean);
      return `<details class="rg-menu-linha"><summary class="rg-mais" title="Mais ações" aria-label="${esc(`Ações da regra ${r.nome}`)}"><i class="ti ti-dots" aria-hidden="true"></i></summary>
        <div class="rg-menu" role="menu">${blocos.join('<hr class="rg-menu-sep">')}</div></details>`;
    }

    // Chave da lista: desligar pausa na hora (até reativar) e o aviso oferece a volta sozinha; ligar reativa.
    // Rascunho não tem chave. As duas passam pelo Desfazer (js/app/telas.js).
    function chaveRegra(r) {
      if (r.rascunho) return '<span class="rg-chave-vazia" aria-hidden="true"></span>';
      const p = pode('pausar', r);
      return `<label class="alr-chave" title="${!p ? 'Esta regra é de outra secretaria' : r.ativa ? 'Pausar esta regra' : 'Reativar esta regra'}"><input type="checkbox" data-chave="${esc(r.id)}" aria-label="${esc(`${r.ativa ? 'Pausar' : 'Reativar'} a regra ${r.nome}`)}"${r.ativa ? ' checked' : ''}${p ? '' : ' disabled'}><span></span></label>`;
    }
    function depoisDaLista(texto, erro, voltar) {
      estado = opcoes.estado();
      aviso = { texto, erro: !!erro, voltar: voltar || null };
      desenharLista();
      aviso = null;
      const novo = el.querySelector('.rg-aviso');
      if (novo) novo.scrollIntoView({ block: 'nearest' });
    }
    // "Voltar sozinha em…" do aviso: pausa de novo, agora com hora para acabar.
    function ligarVoltas() {
      el.querySelectorAll('.rg-aviso [data-voltar]').forEach((b) => {
        b.onclick = () => {
          const minutos = Number(b.dataset.voltar);
          const ok = opcoes.aoRegra(b.dataset.regra, 'pausar', { minutos });
          depoisDaLista(ok ? `Pronto: a regra volta sozinha em ${GC.tempoTexto(minutos)}. Os alertas retidos entram nessa hora.` : 'Não foi possível marcar a volta.', !ok);
        };
      });
    }
    function ligarChaves(caixa) {
      caixa.querySelectorAll('[data-chave]').forEach((c) => {
        c.onchange = () => {
          const id = c.dataset.chave;
          const r = estado.regras.find((x) => x.id === id);
          const nome = r ? `"${r.nome}"` : '';
          if (!c.checked) {
            const ok = opcoes.aoRegra(id, 'pausar', { minutos: null });
            depoisDaLista(ok ? `Regra ${nome} pausada. Os alertas novos dela ficam retidos até você reativar.` : 'Não foi possível pausar.', !ok, ok ? id : null);
            return;
          }
          const ok = opcoes.aoRegra(id, 'retomar');
          depoisDaLista(ok ? `Regra ${nome} reativada. Os alertas retidos entram agora.` : 'Não foi possível reativar.', !ok);
        };
      });
      // Menu ⋯: um aberto por vez, preso à tela (a tabela rola e cortaria um menu absoluto) e fecha com Esc ou clique fora.
      const menus = [...caixa.querySelectorAll('.rg-menu-linha')];
      const fechar = (d) => { d.open = false; };
      menus.forEach((d) => {
        const lista = d.querySelector('.rg-menu');
        d.ontoggle = () => {
          if (!d.open) {
            // A lista mudou enquanto o menu estava aberto: redesenha agora, se nenhum outro ficou aberto.
            if (redesenharDepois && !caixa.querySelector('.rg-menu-linha[open]')) { redesenharDepois = false; setTimeout(desenharTabela, 0); }
            return;
          }
          menus.forEach((x) => { if (x !== d) fechar(x); });
          const s = d.querySelector('summary').getBoundingClientRect();
          // Um ancestral com transform (o painel .sobre) vira a origem do "fixed": mede onde fica o 0,0 e desconta.
          Object.assign(lista.style, { position: 'fixed', top: '0px', left: '0px', right: 'auto' });
          const origem = lista.getBoundingClientRect();
          const escala = lista.offsetWidth ? origem.width / lista.offsetWidth : 1; // o painel pode estar em scale(0.99)
          const alto = origem.height;
          const largo = origem.width;
          const cabeAbaixo = s.bottom + 6 + alto <= window.innerHeight - 8;
          const topo = cabeAbaixo ? s.bottom + 6 : Math.max(8, s.top - 6 - alto);
          const esquerda = Math.max(8, Math.min(s.right - largo, window.innerWidth - largo - 8));
          lista.style.top = `${(topo - origem.top) / escala}px`;
          lista.style.left = `${(esquerda - origem.left) / escala}px`;
          const primeiro = lista.querySelector('.rg-menu-item');
          if (primeiro) primeiro.focus();
        };
        d.onkeydown = (ev) => {
          if (ev.key === 'Escape' && d.open) { ev.stopPropagation(); fechar(d); d.querySelector('summary').focus(); return; }
          if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
            const itens = [...lista.querySelectorAll('.rg-menu-item')];
            const i = itens.indexOf(document.activeElement);
            if (!itens.length) return;
            ev.preventDefault();
            itens[(i + (ev.key === 'ArrowDown' ? 1 : -1) + itens.length) % itens.length].focus();
          }
        };
      });
      // Clique fora ou rolagem fecha (o menu é fixo na tela e ficaria solto ao rolar).
      el.onclick = (ev) => { menus.forEach((d) => { if (d.open && !d.contains(ev.target)) fechar(d); }); };
      el.onscroll = () => { menus.forEach((d) => { if (d.open) fechar(d); }); };
      caixa.querySelectorAll('[data-menu-pausar]').forEach((b) => {
        b.onclick = () => {
          const id = b.dataset.regra;
          const minutos = Number(b.dataset.menuPausar) || null;
          const r = estado.regras.find((x) => x.id === id);
          const nome = r ? `"${r.nome}"` : '';
          const ok = opcoes.aoRegra(id, 'pausar', { minutos });
          depoisDaLista(ok ? (minutos ? `Regra ${nome} pausada por ${GC.tempoTexto(minutos)}. Ela volta sozinha; os alertas retidos entram nessa hora.` : `Regra ${nome} pausada. Os alertas novos dela ficam retidos até você reativar.`) : 'Não foi possível pausar.', !ok);
        };
      });
      caixa.querySelectorAll('[data-menu-reativar]').forEach((b) => {
        b.onclick = () => {
          const r = estado.regras.find((x) => x.id === b.dataset.menuReativar);
          const ok = opcoes.aoRegra(b.dataset.menuReativar, 'retomar');
          depoisDaLista(ok ? `Regra ${r ? `"${r.nome}" ` : ''}reativada. Os alertas retidos entram agora.` : 'Não foi possível reativar.', !ok);
        };
      });
      caixa.querySelectorAll('[data-restaurar]').forEach((b) => {
        b.onclick = async () => {
          const r = estado.regras.find((x) => x.id === b.dataset.restaurar);
          if (!r || !(await perguntar({ titulo: 'Voltar a regra ao padrão?', texto: `A regra "${r.nome}" fica como veio no sistema e a versão ${r.versao} sai do ar.`, sim: 'Voltar ao padrão' }))) return;
          const ok = opcoes.aoRegra(r.id, 'restaurar');
          depoisDaLista(ok ? 'A regra voltou ao padrão do sistema.' : 'Não foi possível restaurar.', !ok);
        };
      });
    }

    // ---------------- editor ----------------
    // Cópia de trabalho: só o que o formulário muda.
    const deRegra = (r) => ({
      nome: r.nome, tipo: r.tipo || '', escopo: { bairros: r.escopo.bairros.slice() }, ondeBairros: r.escopo.bairros.length > 0,
      condicoes: copia(r.condicoes), combinar: r.combinar, gravidade: copia(r.gravidade), prazoMin: r.prazoMin, prazoSolucaoMin: r.prazoSolucaoMin || null,
      escalonamento: copia(r.escalonamento || []), silencio: Object.assign({ intervaloMin: null, juntarRaioM: null }, copia(r.silencio || {})),
      medir: !!r.medir,
    });
    const tiposDoPerfil = () => estado.tipos.filter((t) => !estado.setor || t.area === estado.setor);

    function abrirEditor() {
      teste = null;
      if (rota.id === 'nova') {
        const base = rota.base ? estado.regras.find((r) => r.id === rota.base && !r.rascunho) : null;
        if (base) {
          form = deRegra(base);
          form.nome = `${base.nome} · cópia`.slice(0, 120);
        } else {
          form = { nome: '', tipo: '', escopo: { bairros: [] }, ondeBairros: false, condicoes: [], combinar: 'E', gravidade: { base: null, sobe: [] }, prazoMin: null, prazoSolucaoMin: null,
            escalonamento: [], silencio: { intervaloMin: null, juntarRaioM: null }, medir: false };
        }
        original = null;
        return;
      }
      const r = estado.regras.find((x) => x.id === rota.id);
      if (!r) { form = null; original = null; return; }
      form = deRegra(r);
      // Rascunho da Maia: tenta montar as condições a partir da expressão original.
      if (r.rascunho && !form.condicoes.length && GC.condicoesDaExpressao) {
        const p = GC.condicoesDaExpressao(r.expressaoOriginal);
        form.condicoes = p.condicoes;
        form.combinar = p.combinar;
      }
      original = deRegra(r);
    }

    const regraAtual = () => (rota.id === 'nova' ? null : estado.regras.find((x) => x.id === rota.id));
    // Regra montada com o que está no formulário (para a prévia e para o teste).
    function regraDoForm() {
      const r = regraAtual();
      const igualCondicao = r && r.texto && JSON.stringify([original.condicoes, original.combinar]) === JSON.stringify([form.condicoes, form.combinar]);
      return Object.assign({}, form, {
        condicoes: form.condicoes.filter((c) => c.metrica),
        area: form.tipo && GC.areaDoTipo ? GC.areaDoTipo(form.tipo) : r ? r.area : null,
        texto: igualCondicao ? r.texto : null,
        expressaoOriginal: igualCondicao ? r.expressaoOriginal : null,
      });
    }
    const mudou = () => !original || JSON.stringify(form) !== JSON.stringify(original);

    function opcoesMetrica(atual, area) {
      const lista = GC.METRICAS_ALERTA.filter((m) => m.id !== 'afetados');
      const grupos = [
        ['Desta secretaria', lista.filter((m) => area && m.area === area)],
        ['Gerais', lista.filter((m) => !m.area)],
        ['Outras secretarias', lista.filter((m) => m.area && m.area !== area)],
      ].filter(([, ms]) => ms.length);
      return `<option value="">Escolha o que medir</option>${grupos.map(([g, ms]) => `<optgroup label="${g}">${ms.map((m) => `<option value="${m.id}"${m.id === atual ? ' selected' : ''}>${esc(maiuscula(m.nome))}${m.unidade && m.unidade !== '×' ? ` (${esc(m.unidade)})` : ''}${m.fonte ? ' · medida nos dados' : ''}</option>`).join('')}</optgroup>`).join('')}`;
    }

    function linhaCondicao(c, i, area) {
      const m = metrica(c.metrica);
      const sim = m && m.tipo === 'sim';
      return `<li class="rg-cond" data-i="${i}">
        <label class="rg-campo rg-campo-metrica"><span class="so-leitor">Condição ${i + 1}: o que medir</span><select data-campo="metrica">${opcoesMetrica(c.metrica, area)}</select></label>
        ${sim ? '<span class="rg-sim">acontece</span>' : `
        <label class="rg-campo"><span class="so-leitor">Comparação</span><select data-campo="operador">${OPS.map(([v, n]) => `<option value="${v}"${v === c.operador ? ' selected' : ''}>${n}</option>`).join('')}</select></label>
        <label class="rg-campo rg-campo-num"><span class="so-leitor">Valor</span><input type="number" step="any" data-campo="valor" value="${c.valor === undefined || c.valor === null ? '' : esc(String(c.valor))}" placeholder="valor"></label>
        <span class="rg-unidade">${esc(m ? m.unidade : '')}</span>`}
        <label class="rg-campo rg-campo-janela${c.janelaMin ? ' rg-com-janela' : ''}" title="Opcional: só conta o que aconteceu dentro deste tempo"><i class="ti ti-clock" aria-hidden="true"></i>em<input type="number" min="1" step="1" data-campo="janelaMin" value="${c.janelaMin || ''}" placeholder="—" aria-label="Janela em minutos (opcional)">min</label>
        <button type="button" class="rg-x" data-remover-cond="${i}" aria-label="Tirar a condição ${i + 1}" title="Tirar esta condição"><i class="ti ti-x" aria-hidden="true"></i></button>
      </li>`;
    }

    function linhaSubida(s, i) {
      return `<li class="rg-cond" data-sobe="${i}">
        <span>Se as pessoas afetadas forem</span>
        <label class="rg-campo"><span class="so-leitor">Comparação</span><select data-campo-sobe="operador">${OPS.map(([v, n]) => `<option value="${v}"${v === s.operador ? ' selected' : ''}>${n}</option>`).join('')}</select></label>
        <label class="rg-campo rg-campo-num"><span class="so-leitor">Número de pessoas</span><input type="number" min="0" step="1" data-campo-sobe="valor" value="${esc(String(s.valor))}"></label>
        <span>, sobe para</span>
        <label class="rg-campo"><span class="so-leitor">Gravidade</span><select data-campo-sobe="para">${Object.entries(SEV).map(([v, n]) => `<option value="${v}"${v === s.para ? ' selected' : ''}>${n}</option>`).join('')}</select></label>
        <button type="button" class="rg-x" data-remover-sobe="${i}" aria-label="Tirar a subida ${i + 1}" title="Tirar esta subida"><i class="ti ti-x" aria-hidden="true"></i></button>
      </li>`;
    }

    function linhaEscala(e, i) {
      const horas = e.aposMin % 60 === 0;
      return `<li class="rg-cond" data-escala="${i}">
        <span>Se ficar</span>
        <label class="rg-campo rg-campo-num"><span class="so-leitor">Tempo</span><input type="number" min="1" step="1" data-campo-escala="valor" value="${horas ? e.aposMin / 60 : e.aposMin}"></label>
        <label class="rg-campo"><span class="so-leitor">Unidade</span><select data-campo-escala="unidade"><option value="h"${horas ? ' selected' : ''}>horas</option><option value="min"${horas ? '' : ' selected'}>min</option></select></label>
        <span>sem equipe em campo:</span>
        <label class="rg-campo"><span class="so-leitor">O que fazer</span><select data-campo-escala="acao">${Object.entries(GC.ACOES_ESCALONAMENTO).map(([v, n]) => `<option value="${v}"${v === e.acao ? ' selected' : ''}>${n}</option>`).join('')}</select></label>
        <button type="button" class="rg-x" data-remover-escala="${i}" aria-label="Tirar o degrau ${i + 1}" title="Tirar este degrau"><i class="ti ti-x" aria-hidden="true"></i></button>
      </li>`;
    }

    // Disparar sozinha (fase 4): só quando todas as condições são medidas pela mesma fonte de dados.
    function blocoMedir() {
      const fonte = GC.fonteDaRegra(regraDoForm());
      if (!fonte) {
        if (form.medir) form.medir = false;
        const medidas = GC.METRICAS_ALERTA.filter((m) => m.fonte).map((m) => m.nome);
        return `<p class="rg-dica rg-medir-off"><i class="ti ti-plug-connected-x" aria-hidden="true"></i> Esta regra dispara pela integração da secretaria. Para ela disparar sozinha, use só condições medidas nos dados (${esc(medidas.slice(0, 4).join(', '))}…), todas da mesma fonte.</p>`;
      }
      return `<label class="rg-medir"><input type="checkbox" name="medir"${form.medir ? ' checked' : ''}>
        <span><b>Disparar sozinha a partir dos dados</b><small>Lê ${esc(GC.FONTES_MEDIDAS[fonte].nome)} a cada passo da simulação. Cada alvo que passar vira um alerta (sem repetir enquanto ele estiver aberto).</small></span></label>`;
    }

    // Opção em cartão (rádio com ícone, título e uma linha de explicação).
    const opcao = (nome, valor, marcado, icone, titulo, sub) => `<label class="rg-opcao"><input type="radio" name="${nome}" value="${valor}"${marcado ? ' checked' : ''}>
      <i class="ti ${icone}" aria-hidden="true"></i><span><b>${esc(titulo)}</b><small>${sub}</small></span></label>`;
    // Os três prazos por gravidade, cada um na cor dela (o texto já vem escapado aqui).
    const escadaPrazos = (p) => ['critica', 'alta', 'media'].map((g) => `<span class="rg-esc rg-esc-${g}">${esc(SEV[g].toLowerCase())} ${esc(GC.tempoTexto(p[g]))}</span>`).join('');

    function desenharEditor() {
      const r = regraAtual();
      if (rota.id !== 'nova' && !r) {
        el.innerHTML = `<header class="sec-topo"><div><a class="rg-voltar" href="#/regras">← Regras de alerta</a><h2>Regra não encontrada</h2>
          <p>Ela pode ter sido excluída, ou é de uma secretaria que o seu perfil não vê.</p></div></header>`;
        return;
      }
      const nova = !r;
      const podeMudar = nova ? (estado.setor ? pode('criar', { area: estado.setor }) : true) : pode('editar', r);
      const padrao = r && r.origem === 'padrao';
      const area = regraDoForm().area;
      const prazos = estado.prazos;
      const prazoProprio = !!form.prazoMin;
      const emHoras = !form.prazoMin || form.prazoMin % 60 === 0;
      const solucoes = GC.prazosPadrao().solucao;
      const solucaoPropria = !!form.prazoSolucaoMin;
      const emDias = !!form.prazoSolucaoMin && form.prazoSolucaoMin % 1440 === 0;
      const titulo = nova ? (rota.base ? 'Duplicar regra' : 'Nova regra') : r.rascunho ? `Revisar rascunho · ${r.nome}` : r.nome;
      const tipoSel = padrao
        ? `<p class="rg-fixo">${esc(maiuscula(r.tipo))} <small>(regra do sistema: o tipo não muda)</small></p>`
        : `<select name="tipo" required><option value="">Escolha o tipo</option>${tiposDoPerfil().map((t) => `<option value="${esc(t.tipo)}"${t.tipo === form.tipo ? ' selected' : ''}>${esc(t.nome)}${t.area ? ` · ${esc(nomeArea(t.area))}` : ''}</option>`).join('')}</select>`;
      const acoesTopo = r && !nova ? [
        !r.rascunho && pode('pausar', r) ? (r.pausa
          ? '<button type="button" class="btn-sec" data-acao="retomar"><i class="ti ti-player-play" aria-hidden="true"></i> Reativar</button>'
          : `<details class="rg-menu-pausa"><summary class="btn-sec"><i class="ti ti-player-pause" aria-hidden="true"></i> Pausar <i class="ti ti-chevron-down rg-menu-seta" aria-hidden="true"></i></summary>
              <div class="rg-menu" role="group" aria-label="Pausar por quanto tempo"><span class="rg-menu-tit">Pausar por quanto tempo?</span>
              ${[['60', '1 hora'], ['240', '4 horas'], ['1440', '24 horas'], ['4320', '3 dias'], ['10080', '7 dias'], ['', 'Até reativar']].map(([m, n]) => `<button type="button" data-acao="pausar" data-minutos="${m}">${m ? `por ${n}` : n}</button>`).join('')}
              </div></details>`) : '',
        r.modificada && pode('restaurar', r) ? '<button type="button" class="btn-sec" data-acao="restaurar"><i class="ti ti-restore" aria-hidden="true"></i> Restaurar padrão</button>' : '',
        r.origem !== 'padrao' && pode('excluir', r) ? '<button type="button" class="btn-sec rg-perigo" data-acao="excluir"><i class="ti ti-trash" aria-hidden="true"></i> Excluir</button>' : '',
      ].join('') : '';
      const s = r ? situacaoDe(r) : null;
      el.innerHTML = `
        <header class="sec-topo"><div><a class="rg-voltar" href="#/regras">← Regras de alerta</a>
          <h2>${esc(titulo)}</h2>
          <p>${r ? `${selos(r)} <span class="rg-sit ${s.classe}">${esc(s.texto)}</span>${r.editadaEm ? ` · editada${r.editadaPor ? ` por ${esc(r.editadaPor)}` : ''} às ${hora(r.editadaEm)}` : ''}` : 'Ela vale para ocorrências que nascerem depois de salvar.'}</p></div>
          <span class="sec-acoes">${acoesTopo}</span></header>
        ${avisoHtml()}
        ${r && r.rascunho ? `<p class="rg-nota"><i class="ti ti-sparkles" aria-hidden="true"></i> Rascunho criado pela Maia a partir de uma pergunta. Expressão original: <code>${esc(r.expressaoOriginal || '—')}</code>. Escolha o tipo, confira as condições e salve para ativar.</p>` : ''}
        ${!podeMudar ? `<p class="rg-nota"><i class="ti ti-lock" aria-hidden="true"></i> Esta regra é da ${esc(nomeArea(r.area) || 'outra secretaria')}. Você pode ver; só quem cuida dela ou o Gabinete do Prefeito muda.</p>` : ''}
        <div class="rg-editor">
          <form class="rg-form" novalidate>
            <fieldset class="rg-tudo"${podeMudar ? '' : ' disabled'}>
            <section class="rel-cartao rg-passo"><h3><span class="rg-num">1</span> O que é</h3>
              <label class="rg-linha">Nome<input type="text" name="nome" maxlength="120" value="${esc(form.nome)}" required placeholder="Ex.: Alagamento no Centro"></label>
              <div class="rg-linha">Tipo de ocorrência${tipoSel}</div>
              ${area ? `<p class="rg-dica">Secretaria: <b>${esc(nomeArea(area))}</b> (vem do tipo)</p>` : ''}
            </section>
            <section class="rel-cartao rg-passo"><h3><span class="rg-num">2</span> Quando dispara</h3>
              ${form.condicoes.length > 1 ? `<div class="rg-seg" role="radiogroup" aria-label="Como juntar as condições"><span>Dispara quando</span>
                <label><input type="radio" name="combinar" value="E"${form.combinar !== 'OU' ? ' checked' : ''}><span>todas acontecem</span></label>
                <label><input type="radio" name="combinar" value="OU"${form.combinar === 'OU' ? ' checked' : ''}><span>qualquer uma acontece</span></label>
              </div>` : ''}
              <ol class="rg-conds">${form.condicoes.map((c, i) => (i ? `<li class="rg-conector" aria-hidden="true"><span>${form.combinar === 'OU' ? 'ou' : 'e'}</span></li>` : '') + linhaCondicao(c, i, area)).join('')}</ol>
              ${form.condicoes.length ? '' : '<p class="rg-dica">Nenhuma condição ainda.</p>'}
              <button type="button" class="btn-sec rg-add" data-add="cond"><i class="ti ti-plus" aria-hidden="true"></i> Adicionar condição</button>
              <p class="rg-dica"><i class="ti ti-clock" aria-hidden="true"></i> O tempo ao lado de cada condição é opcional: "em 60 min" quer dizer dentro da última hora.</p>
              ${blocoMedir()}
            </section>
            <section class="rel-cartao rg-passo"><h3><span class="rg-num">3</span> Onde vale</h3>
              <div class="rg-opcoes" role="radiogroup" aria-label="Onde a regra vale">
                ${opcao('onde', 'cidade', !(form.escopo.bairros.length || form.ondeBairros), 'ti-building-community', 'Cidade inteira', 'Vale em qualquer bairro')}
                ${opcao('onde', 'bairros', !!(form.escopo.bairros.length || form.ondeBairros), 'ti-map-pin', 'Só em alguns bairros', form.escopo.bairros.length ? `${form.escopo.bairros.length} escolhido${form.escopo.bairros.length > 1 ? 's' : ''}; vence a regra da cidade` : 'Vence a regra da cidade inteira')}
              </div>
              ${form.escopo.bairros.length || form.ondeBairros ? `<div class="rg-bairros">${estado.bairros.map((b) => `<label><input type="checkbox" name="bairro" value="${esc(b.id)}"${form.escopo.bairros.includes(b.id) ? ' checked' : ''}> ${esc(b.nome)}</label>`).join('')}</div>
              <p class="rg-dica">Regra de bairro vence a da cidade inteira do mesmo tipo. Se ela estiver pausada, o alerta do bairro fica retido.</p>` : ''}
            </section>
            <section class="rel-cartao rg-passo"><h3><span class="rg-num">4</span> Quanto pesa</h3>
              <label class="rg-linha">Gravidade<select name="gravidade"><option value="">A que a ocorrência trouxer</option>${Object.entries(SEV).map(([v, n]) => `<option value="${v}"${v === form.gravidade.base ? ' selected' : ''}>Sempre ${n.toLowerCase()}</option>`).join('')}</select></label>
              <ol class="rg-conds">${form.gravidade.sobe.map(linhaSubida).join('')}</ol>
              <button type="button" class="btn-sec rg-add" data-add="sobe"><i class="ti ti-arrow-big-up-lines" aria-hidden="true"></i> Subir a gravidade conforme as pessoas afetadas</button>
            </section>
            <section class="rel-cartao rg-passo"><h3><span class="rg-num">5</span> Prazos</h3>
              <p class="rg-dica">Dois prazos, contados desde que o alerta nasce: pôr equipe em campo (o do "prazo estourado") e resolver (o do "% no prazo").</p>
              <p class="rg-sub">Pôr equipe em campo</p>
              <div class="rg-opcoes" role="radiogroup" aria-label="Prazo para pôr equipe em campo">
                ${opcao('prazoModo', 'gravidade', !prazoProprio, 'ti-stack-2', 'O da gravidade', escadaPrazos(prazos))}
                ${opcao('prazoModo', 'proprio', prazoProprio, 'ti-clock-edit', 'Prazo próprio', 'O mesmo para qualquer gravidade')}
              </div>
              ${prazoProprio ? `<label class="rg-linha rg-prazo">Prazo<input type="number" name="prazoValor" min="1" step="1" value="${emHoras ? form.prazoMin / 60 : form.prazoMin}"><select name="prazoUnidade"><option value="h"${emHoras ? ' selected' : ''}>horas</option><option value="min"${emHoras ? '' : ' selected'}>minutos</option></select></label>` : ''}
              <p class="rg-sub">Resolver</p>
              <div class="rg-opcoes" role="radiogroup" aria-label="Prazo para resolver">
                ${opcao('solucaoModo', 'gravidade', !solucaoPropria, 'ti-stack-2', 'O da gravidade', escadaPrazos(solucoes))}
                ${opcao('solucaoModo', 'proprio', solucaoPropria, 'ti-clock-edit', 'Prazo próprio', 'Nunca menor que o de pôr equipe em campo')}
              </div>
              ${solucaoPropria ? `<label class="rg-linha rg-prazo">Prazo<input type="number" name="solucaoValor" min="1" step="1" value="${emDias ? form.prazoSolucaoMin / 1440 : Math.round(form.prazoSolucaoMin / 60)}"><select name="solucaoUnidade"><option value="d"${emDias ? ' selected' : ''}>dias</option><option value="h"${emDias ? '' : ' selected'}>horas</option></select></label>` : ''}
            </section>
            <section class="rel-cartao rg-passo"><h3><span class="rg-num">6</span> Escalar <small class="rg-opcional">opcional</small></h3>
              <p class="rg-dica rg-dica-topo">Se o alerta ficar sem equipe em campo, ele sobe para "Precisam de você". A cobrança só é proposta: quem cobra é o Gabinete.</p>
              <ol class="rg-conds">${form.escalonamento.map(linhaEscala).join('')}</ol>
              ${form.escalonamento.length < 3 ? '<button type="button" class="btn-sec rg-add" data-add="escala"><i class="ti ti-stairs-up" aria-hidden="true"></i> Adicionar degrau de escalonamento</button>' : ''}
            </section>
            <section class="rel-cartao rg-passo"><h3><span class="rg-num">7</span> Silenciar repetidos <small class="rg-opcional">opcional</small></h3>
              <div class="rg-silencio">
                <div class="rg-sil-linha${form.silencio.intervaloMin ? ' rg-ligado' : ''}"><label class="rg-sil-chave"><input type="checkbox" name="usaIntervalo"${form.silencio.intervaloMin ? ' checked' : ''}> Não disparar de novo no mesmo bairro por</label>
                  <span class="rg-sil-valor"><input type="number" name="intervaloMin" min="5" step="5" value="${form.silencio.intervaloMin || 60}"${form.silencio.intervaloMin ? '' : ' disabled'} aria-label="Intervalo em minutos"> min</span></div>
                <div class="rg-sil-linha${form.silencio.juntarRaioM ? ' rg-ligado' : ''}"><label class="rg-sil-chave"><input type="checkbox" name="usaRaio"${form.silencio.juntarRaioM ? ' checked' : ''}> Juntar alerta repetido a menos de</label>
                  <span class="rg-sil-valor"><input type="number" name="juntarRaioM" min="10" step="10" value="${form.silencio.juntarRaioM || 300}"${form.silencio.juntarRaioM ? '' : ' disabled'} aria-label="Raio em metros"> m de um aberto da mesma regra</span></div>
                <p class="rg-dica">O disparo silenciado ou juntado fica na linha do tempo do alerta que já existe; nenhum alerta novo nasce.</p>
              </div>
            </section>
            </fieldset>
          </form>
          <aside class="rel-cartao rg-previa" aria-live="polite">
            <h3>Como fica</h3>
            <div class="rg-previa-corpo"></div>
            <button type="button" class="btn-sec rg-testar"><i class="ti ti-chart-bar" aria-hidden="true"></i> Testar nos últimos 30 dias</button>
            <div class="rg-teste"></div>
          </aside>
        </div>
        ${podeMudar ? `<div class="rg-barra">
          <p class="rg-barra-estado" aria-live="polite"></p>
          <a class="btn-sec" href="#/regras">Cancelar</a>
          <button type="button" class="btn-primario rg-salvar">${nova ? 'Criar regra' : r.rascunho ? 'Salvar e ativar' : 'Salvar'}</button></div>` : ''}`;
      ligarEditor();
      desenharPrevia();
      desenharTeste();
    }

    function desenharPrevia() {
      const caixa = el.querySelector('.rg-previa-corpo');
      if (!caixa) return;
      const r = regraDoForm();
      const palavras = form.condicoes.length ? GC.regraEmPalavrasEstruturada(r) : '';
      const base = form.gravidade.base;
      const tipoNome = form.tipo ? form.tipo.toLowerCase() : '';
      const onde = form.escopo.bairros.length ? `em ${ondeTexto(form.escopo.bairros)}` : 'em qualquer bairro';
      // A frase principal: o alerta que nasce, onde e quando.
      const frase = palavras
        ? `Nasce um alerta${tipoNome ? ` de <b>${esc(tipoNome)}</b>` : ''}${base ? `, <b class="rg-g-${base}">sempre ${esc(SEV[base].toLowerCase())}</b>,` : ''} <b>${esc(onde)}</b> quando: ${esc(palavras.charAt(0).toLowerCase() + palavras.slice(1))}`
        : '<span class="rg-dica">Adicione ao menos uma condição para ver como a regra fica.</span>';
      const subidas = form.gravidade.sobe.map((s) => `Sobe para ${SEV[s.para].toLowerCase()} com ${GC.OPERADORES_ALERTA[s.operador]} ${Number(s.valor).toLocaleString('pt-BR')} pessoas afetadas`);
      // Prazo efetivo: o próprio; senão, o da gravidade fixa; senão, depende da gravidade da ocorrência.
      const prazoTxt = (proprio, porGrav) => (proprio ? GC.tempoTexto(proprio) : base ? `${GC.tempoTexto(porGrav[base])} (da gravidade)` : 'o da gravidade');
      const itens = [
        ['ti-users-group', 'Equipe em campo', prazoTxt(form.prazoMin, estado.prazos)],
        ['ti-circle-check', 'Resolver', prazoTxt(form.prazoSolucaoMin, GC.prazosPadrao().solucao)],
        ...subidas.map((s) => ['ti-arrow-big-up-lines', 'Gravidade', s]),
        ['ti-stairs-up', 'Escalar', form.escalonamento.length ? form.escalonamento.slice().sort((a, b) => a.aposMin - b.aposMin).map(GC.escalonamentoEmPalavras).join('; ') : 'não escala'],
        ['ti-bell-off', 'Silêncio', GC.silencioEmPalavras(form.silencio) || 'todo disparo vira alerta'],
      ];
      caixa.innerHTML = `
        <p class="rg-frase">${frase}</p>
        <ul class="rg-resumo">${itens.map(([ic, rot, txt]) => `<li><i class="ti ${ic}" aria-hidden="true"></i><span><small>${esc(rot)}</small>${esc(txt)}</span></li>`).join('')}</ul>
        ${palavras ? `<details class="rg-tecnica"><summary>Ver a regra técnica</summary><code>${esc(r.texto && r.expressaoOriginal ? r.expressaoOriginal : GC.expressaoRegra(r))}</code></details>` : ''}
        ${previaAgora(r)}`;
      estadoBarra();
    }

    // Barra de salvar (fixa no pé do editor): diz se há mudança por salvar.
    function estadoBarra() {
      const caixa = el.querySelector('.rg-barra-estado');
      if (!caixa) return;
      const nova = rota.id === 'nova';
      const pendente = nova || mudou();
      caixa.classList.toggle('rg-pendente', pendente);
      caixa.innerHTML = nova
        ? '<i class="ti ti-point-filled" aria-hidden="true"></i> Regra nova: vale para os alertas que nascerem depois de criar.'
        : pendente
          ? '<i class="ti ti-point-filled" aria-hidden="true"></i> Mudanças ainda não salvas. Valem só para alertas que nascerem depois de salvar.'
          : '<i class="ti ti-check" aria-hidden="true"></i> Nenhuma mudança desde que você abriu.';
    }

    function previaAgora(r) {
      const fonte = GC.fonteDaRegra(r);
      if (!fonte) return '';
      const alvos = GC.alvosQuePassam(r);
      const titulo = form.medir ? 'Com os dados de agora, dispararia para' : 'Se disparasse sozinha agora, seria para';
      return `<div class="rg-agora"><p class="rg-agora-tit"><i class="ti ti-activity" aria-hidden="true"></i> ${titulo}:</p>
        ${alvos.length ? `<ul>${alvos.slice(0, 6).map((a) => `<li><b>${esc(a.nome)}</b> <small>${esc(GC.valoresEmPalavras(r, a).join(' · '))}</small></li>`).join('')}</ul>${alvos.length > 6 ? `<p class="rg-dica">e mais ${alvos.length - 6}.</p>` : ''}`
          : '<p class="rg-dica">Nenhum alvo passa dos limites agora.</p>'}
        <p class="rg-dica">Alvo que já tem alerta aberto do mesmo tipo no bairro não ganha outro.</p></div>`;
    }

    function desenharTeste() {
      const caixa = el.querySelector('.rg-teste');
      if (!caixa) return;
      if (!teste) { caixa.innerHTML = ''; return; }
      if (teste.erro) { caixa.innerHTML = `<p class="rg-dica">${esc(teste.erro)}</p>`; return; }
      const max = Math.max(1, ...teste.porBairro.map((b) => b.n));
      caixa.innerHTML = `
        <p class="rg-teste-total"><b>${teste.total || !teste.bruto ? `~${teste.total}` : 'menos de 1'}</b> disparo${teste.total === 1 || (!teste.total && teste.bruto) ? '' : 's'} em 30 dias <small>(a regra do sistema teve ${teste.base} na cidade)</small></p>
        ${teste.porBairro.length ? `<ul class="rg-barras">${teste.porBairro.slice(0, 6).map((b) => `<li><span>${esc(b.nome)}</span><i style="--w:${Math.round((b.n / max) * 100)}%"></i><b>${b.n}</b></li>`).join('')}</ul>` : '<p class="rg-dica">Nenhum bairro do recorte teria disparado.</p>'}
        ${teste.notas.map((n) => `<p class="rg-dica">${esc(n)}</p>`).join('')}
        <p class="rg-dica">Estimativa a partir do histórico de 30 dias da secretaria. Não é uma contagem exata.</p>`;
    }

    function ligarEditor() {
      const fm = el.querySelector('.rg-form');
      if (!fm) return;
      fm.onsubmit = (ev) => ev.preventDefault();
      const tudo = () => { teste = null; desenharEditor(); };
      const leve = () => { teste = null; desenharPrevia(); desenharTeste(); };
      fm.nome.oninput = () => { form.nome = fm.nome.value; desenharPrevia(); };
      if (fm.tipo) fm.tipo.onchange = () => { form.tipo = fm.tipo.value; tudo(); };
      fm.querySelectorAll('input[name="combinar"]').forEach((x) => {
        x.onchange = () => {
          form.combinar = x.value;
          fm.querySelectorAll('.rg-conector span').forEach((s) => { s.textContent = x.value === 'OU' ? 'ou' : 'e'; });
          leve();
        };
      });
      if (fm.medir) fm.medir.onchange = () => { form.medir = fm.medir.checked; leve(); };
      fm.querySelectorAll('.rg-cond[data-i]').forEach((li) => {
        const c = form.condicoes[Number(li.dataset.i)];
        li.querySelector('[data-campo="metrica"]').onchange = (ev) => {
          const m = metrica(ev.target.value);
          c.metrica = ev.target.value;
          if (m && m.tipo === 'sim') { c.operador = 'sim'; delete c.valor; } else if (c.operador === 'sim' || !c.operador) { c.operador = '>'; }
          tudo();
        };
        const op = li.querySelector('[data-campo="operador"]');
        if (op) op.onchange = () => { c.operador = op.value; leve(); };
        const val = li.querySelector('[data-campo="valor"]');
        if (val) val.oninput = () => { c.valor = val.value === '' ? undefined : Number(val.value); leve(); };
        const jan = li.querySelector('[data-campo="janelaMin"]');
        jan.oninput = () => {
          const v = Math.round(Number(jan.value));
          if (jan.value === '' || !v) delete c.janelaMin; else c.janelaMin = v;
          jan.closest('.rg-campo-janela').classList.toggle('rg-com-janela', !!c.janelaMin);
          leve();
        };
      });
      fm.querySelectorAll('[data-remover-cond]').forEach((b) => { b.onclick = () => { form.condicoes.splice(Number(b.dataset.removerCond), 1); tudo(); }; });
      fm.querySelectorAll('[data-add]').forEach((b) => {
        b.onclick = () => {
          if (b.dataset.add === 'cond') form.condicoes.push({ metrica: '', operador: '>' });
          else if (b.dataset.add === 'escala') form.escalonamento.push({ aposMin: 60, acao: 'avisar_gabinete' });
          else form.gravidade.sobe.push({ metrica: 'afetados', operador: '>', valor: 1000, para: 'critica' });
          tudo();
          const alvo = b.dataset.add === 'cond'
            ? el.querySelector(`.rg-cond[data-i="${form.condicoes.length - 1}"] [data-campo="metrica"]`)
            : b.dataset.add === 'escala' ? el.querySelector(`.rg-cond[data-escala="${form.escalonamento.length - 1}"] input`)
              : el.querySelector(`.rg-cond[data-sobe="${form.gravidade.sobe.length - 1}"] select`);
          if (alvo) alvo.focus();
        };
      });
      fm.querySelectorAll('input[name="onde"]').forEach((x) => {
        x.onchange = () => {
          form.ondeBairros = x.value === 'bairros';
          if (!form.ondeBairros) form.escopo.bairros = [];
          tudo();
        };
      });
      fm.querySelectorAll('input[name="bairro"]').forEach((x) => {
        x.onchange = () => {
          form.escopo.bairros = [...fm.querySelectorAll('input[name="bairro"]:checked')].map((y) => y.value);
          leve();
        };
      });
      fm.gravidade.onchange = () => { form.gravidade.base = fm.gravidade.value || null; leve(); };
      fm.querySelectorAll('.rg-cond[data-sobe]').forEach((li) => {
        const s = form.gravidade.sobe[Number(li.dataset.sobe)];
        li.querySelectorAll('[data-campo-sobe]').forEach((x) => {
          const k = x.dataset.campoSobe;
          x.oninput = x.onchange = () => { s[k] = k === 'valor' ? Number(x.value) : x.value; leve(); };
        });
      });
      fm.querySelectorAll('.rg-cond[data-escala]').forEach((li) => {
        const e = form.escalonamento[Number(li.dataset.escala)];
        const valor = li.querySelector('[data-campo-escala="valor"]');
        const unidade = li.querySelector('[data-campo-escala="unidade"]');
        const tempo = () => { const v = Number(valor.value); e.aposMin = v > 0 ? Math.round(unidade.value === 'h' ? v * 60 : v) : 0; leve(); };
        valor.oninput = tempo;
        unidade.onchange = tempo;
        li.querySelector('[data-campo-escala="acao"]').onchange = (ev) => { e.acao = ev.target.value; leve(); };
      });
      fm.querySelectorAll('[data-remover-escala]').forEach((b) => { b.onclick = () => { form.escalonamento.splice(Number(b.dataset.removerEscala), 1); tudo(); }; });
      const silencio = (chave, nome, campo) => {
        const caixa = fm.querySelector(`input[name="${chave}"]`);
        const num = fm.querySelector(`input[name="${nome}"]`);
        caixa.onchange = () => {
          form.silencio[campo] = caixa.checked ? Math.round(Number(num.value)) || null : null;
          num.disabled = !caixa.checked;
          caixa.closest('.rg-sil-linha').classList.toggle('rg-ligado', caixa.checked);
          leve();
        };
        num.oninput = () => { if (caixa.checked) { form.silencio[campo] = Math.round(Number(num.value)) || 0; leve(); } };
      };
      silencio('usaIntervalo', 'intervaloMin', 'intervaloMin');
      silencio('usaRaio', 'juntarRaioM', 'juntarRaioM');
      fm.querySelectorAll('[data-remover-sobe]').forEach((b) => { b.onclick = () => { form.gravidade.sobe.splice(Number(b.dataset.removerSobe), 1); tudo(); }; });
      fm.querySelectorAll('input[name="prazoModo"]').forEach((x) => {
        x.onchange = () => { form.prazoMin = x.value === 'proprio' ? (form.prazoMin || 120) : null; tudo(); };
      });
      const prazoMin = () => {
        const v = Number(fm.prazoValor.value);
        form.prazoMin = v > 0 ? Math.round(fm.prazoUnidade.value === 'h' ? v * 60 : v) : 0;
        leve();
      };
      if (fm.prazoValor) { fm.prazoValor.oninput = prazoMin; fm.prazoUnidade.onchange = prazoMin; }
      fm.querySelectorAll('input[name="solucaoModo"]').forEach((x) => {
        x.onchange = () => { form.prazoSolucaoMin = x.value === 'proprio' ? (form.prazoSolucaoMin || 4320) : null; tudo(); };
      });
      const solucaoMin = () => {
        const v = Number(fm.solucaoValor.value);
        form.prazoSolucaoMin = v > 0 ? Math.round(fm.solucaoUnidade.value === 'd' ? v * 1440 : v * 60) : 0;
        leve();
      };
      if (fm.solucaoValor) { fm.solucaoValor.oninput = solucaoMin; fm.solucaoUnidade.onchange = solucaoMin; }

      el.querySelector('.rg-testar').onclick = () => {
        const r = regraDoForm();
        const est = form.tipo ? GC.estimarRegra(r) : null;
        teste = est || { erro: 'Escolha o tipo de ocorrência para estimar.' };
        desenharTeste();
      };
      const salvar = el.querySelector('.rg-salvar');
      if (salvar) salvar.onclick = salvarForm;
      el.querySelectorAll('[data-acao]').forEach((b) => { b.onclick = () => acaoTopo(b.dataset.acao, b); });
      // O menu "Pausar" fecha com clique fora ou Esc.
      const menu = el.querySelector('.rg-menu-pausa');
      if (menu) {
        el.onclick = (ev) => { if (menu.open && !menu.contains(ev.target)) menu.open = false; };
        menu.onkeydown = (ev) => { if (ev.key === 'Escape' && menu.open) { ev.stopPropagation(); menu.open = false; menu.querySelector('summary').focus(); } };
      }
    }

    function mensagem(texto, erro) {
      aviso = { texto, erro: !!erro };
      const antigo = el.querySelector('.rg-aviso');
      const novo = document.createElement('div');
      novo.innerHTML = avisoHtml();
      if (antigo) antigo.replaceWith(novo.firstElementChild);
      else el.querySelector('.sec-topo').insertAdjacentElement('afterend', novo.firstElementChild);
      el.querySelector('.rg-aviso').scrollIntoView({ block: 'nearest' });
    }

    function salvarForm() {
      if (form.ondeBairros && !form.escopo.bairros.length) { mensagem(MOTIVOS.bairros, true); return; }
      if (form.prazoMin === 0) { mensagem(MOTIVOS.prazo, true); return; }
      if (form.prazoSolucaoMin === 0) { mensagem(MOTIVOS.prazo_solucao, true); return; }
      const dados = {
        nome: String(form.nome || '').trim(), escopo: { bairros: form.escopo.bairros.slice() },
        condicoes: form.condicoes.map((c) => Object.assign({}, c)), combinar: form.combinar,
        gravidade: copia(form.gravidade), prazoMin: form.prazoMin || null, prazoSolucaoMin: form.prazoSolucaoMin || null,
        escalonamento: form.escalonamento.map((e) => Object.assign({}, e)).sort((a, b) => a.aposMin - b.aposMin),
        silencio: { intervaloMin: form.silencio.intervaloMin || null, juntarRaioM: form.silencio.juntarRaioM || null },
        medir: !!form.medir && !!GC.fonteDaRegra(regraDoForm()),
      };
      if (form.silencio.intervaloMin === 0 || form.silencio.juntarRaioM === 0) { mensagem(MOTIVOS.silencio, true); return; }
      const r = regraAtual();
      if (!r) {
        const res = opcoes.aoCriar(Object.assign(dados, { tipo: form.tipo }));
        if (!res || !res.ok) { mensagem(MOTIVOS[res && res.motivo] || 'Não foi possível criar a regra.', true); return; }
        aviso = { texto: 'Regra criada. Ela vale para os alertas que nascerem a partir de agora.' };
        opcoes.aoIr({ tela: 'regras', id: res.regra.id });
        return;
      }
      if (!mudou() && !r.rascunho) { mensagem('Nada mudou desde que você abriu a regra.'); return; }
      if (r.origem !== 'padrao') dados.tipo = form.tipo;
      if (r.rascunho) dados.rascunho = false;
      const res = opcoes.aoSalvar(r.id, dados);
      if (!res || !res.ok) { mensagem(MOTIVOS[res && res.motivo] || 'Não foi possível salvar.', true); return; }
      reabrir(r.rascunho ? 'Regra ativada. A partir de agora ela dispara alertas.' : `Salvo na versão ${res.regra.versao}. Vale para os alertas que nascerem a partir de agora.`);
    }

    // Janela do painel (js/desfazer-ui.js); sem ela, a do navegador.
    function perguntar(o) {
      return GC.confirmar ? GC.confirmar(o) : Promise.resolve(window.confirm(`${o.titulo} ${o.texto}`));
    }

    async function acaoTopo(acao, botao) {
      const r = regraAtual();
      if (!r) return;
      if (acao === 'excluir') {
        // Excluir não passa pelo Desfazer: a janela não promete volta.
        if (!(await perguntar({ titulo: `Excluir a regra "${r.nome}"?`, texto: 'Alertas que ela já disparou continuam abertos. Para tirar do ar por um tempo, use "Pausar".', sim: 'Excluir regra', perigo: true, nota: 'Não dá para desfazer.' }))) return;
        const res = opcoes.aoExcluir(r.id);
        if (!res || !res.ok) { mensagem(MOTIVOS[res && res.motivo] || 'Não foi possível excluir.', true); return; }
        aviso = { texto: `Regra "${r.nome}" excluída.` };
        opcoes.aoIr({ tela: 'regras', id: null });
        return;
      }
      if (acao === 'restaurar' && !(await perguntar({ titulo: 'Voltar a regra ao padrão?', texto: `A regra fica como veio no sistema e a versão ${r.versao} sai do ar.`, sim: 'Voltar ao padrão' }))) return;
      // Pausa com prazo de validade: o tempo do item escolhido no menu (vazio = até reativar).
      const minutos = acao === 'pausar' && botao && botao.dataset.minutos ? Number(botao.dataset.minutos) : null;
      const ok = opcoes.aoRegra(r.id, acao, { minutos });
      if (!ok) { mensagem('Não foi possível concluir.', true); return; }
      reabrir(acao === 'restaurar' ? 'A regra voltou ao padrão do sistema.' : acao === 'pausar' ? (minutos ? `Regra pausada por ${GC.tempoTexto(minutos)}. Ela volta sozinha; os alertas retidos entram nessa hora.` : 'Regra pausada. Alertas novos dela ficam retidos até reativar.') : 'Regra reativada.');
    }

    // Depois de gravar: relê o estado (opcoes.estado) e reabre o editor com a regra como ficou.
    function reabrir(texto) {
      estado = opcoes.estado();
      abrirEditor();
      aviso = { texto };
      desenharEditor();
      aviso = null;
    }

    function desenhar() {
      if (rota.id) desenharEditor();
      else desenharLista();
    }

    return {
      mostrar(r, e) {
        const trocou = !estado || rota.id !== r.id || rota.base !== r.base;
        rota = r;
        estado = e;
        if (trocou) {
          if (rota.id) abrirEditor();
          el.scrollTop = 0;
        }
        desenhar();
        aviso = null;
      },
      // A cada render do app: a lista acompanha; o editor só reabre depois de uma gravação (não perde o que se digita).
      atualizar(e) {
        estado = e;
        if (!rota.id && el.querySelector('.rg-lista')) {
          // Com um menu ⋯ aberto, redesenhar o fecharia no meio do clique: fica para quando ele fechar.
          if (el.querySelector('.rg-menu-linha[open]')) redesenharDepois = true;
          else desenharTabela();
        }
      },
    };
  };
})(window.GC = window.GC || {});
