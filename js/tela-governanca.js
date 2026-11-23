(function (GC) {
  // Governança da Maia (pauta do Paulo Fiuza, item 7): o que a Maia pode fazer em cada perfil, o registro do que ela
  // fez e os alertas de conformidade. Rota #/governanca (só o gestor geral muda as permissões; os outros perfis veem).
  //   - Permissões: algumas a prefeitura liga e desliga; outras são travadas (a Maia nunca publica sozinha e nunca
  //     mostra dado pessoal identificável). Guardadas por cidade (gc.maia.governanca.<cidade>).
  //   - Registro: as ações ligadas à Maia na auditoria (ofícios, posts, regras) e as respostas recentes.
  //   - Conformidade: calculada na hora (fonte atrasada usada nas respostas, post da Maia sem aprovação, fila parada)
  //     e alguns casos de exemplo; cada alerta leva à tela que resolve.
  const ic = (n) => `<i class="ti ti-${n}" aria-hidden="true"></i>`;
  const esc = (t) => (GC.escaparHtml ? GC.escaparHtml(t) : String(t));
  const H = 3600000;
  const agora = () => (GC.agora ? GC.agora() : Date.now());
  const chave = () => `gc.maia.governanca.${GC.cidade ? GC.cidade.id : 'media'}`;

  // Ações novas na auditoria (usadas por Minha visão, orçamento, plano, publicações, fontes e esta tela).
  if (GC.ACOES_AUDITORIA) {
    Object.assign(GC.ACOES_AUDITORIA, {
      minha_visao: { nome: 'Mudou a própria visão do painel', grupo: 'conta', icone: 'adjustments-horizontal' },
      oficio_maia: { nome: 'Gerou ofício com a Maia', grupo: 'exportacao', icone: 'file-text' },
      orcamento_regras: { nome: 'Mudou as regras de alerta do orçamento', grupo: 'configuracao', icone: 'bell-cog' },
      plano_eixos: { nome: 'Mudou os eixos do plano de governo', grupo: 'metas', icone: 'hierarchy-2' },
      plano_pdf: { nome: 'Baixou o plano de governo em PDF', grupo: 'exportacao', icone: 'file-type-pdf' },
      publicacao_criar: { nome: 'Criou post na agenda de publicação', grupo: 'configuracao', icone: 'speakerphone' },
      publicacao_aprovar: { nome: 'Aprovou post da agenda', grupo: 'configuracao', icone: 'check' },
      publicacao_publicar: { nome: 'Publicou post', grupo: 'configuracao', icone: 'send' },
      publicacao_descartar: { nome: 'Descartou post', grupo: 'configuracao', icone: 'trash' },
      fonte_pedir: { nome: 'Pediu atualização de fonte de dados', grupo: 'configuracao', icone: 'refresh' },
      maia_permissao: { nome: 'Mudou o que a Maia pode fazer', grupo: 'configuracao', icone: 'robot' },
    });
  }

  // O que a Maia pode fazer. trava: não muda (princípio). padrao: { gestor geral, secretaria, servidor, cidadão }.
  const PERMISSOES = [
    { id: 'responder', nome: 'Responder com os dados do painel', desc: 'Sempre dizendo de onde veio o número e quando foi atualizado.', padrao: [true, true, true, true] },
    { id: 'abrir', nome: 'Abrir telas, filtros e o mapa', desc: 'Leva a pessoa até o lugar certo do painel.', padrao: [true, true, true, false] },
    { id: 'rascunhos', nome: 'Escrever rascunhos', desc: 'Ofícios, memorandos, notas, comunicados e posts. Sempre como rascunho editável.', padrao: [true, true, false, false] },
    { id: 'demanda', nome: 'Sugerir cobrança ou demanda', desc: 'A Maia monta; a pessoa confirma antes de enviar.', padrao: [true, true, false, false] },
    { id: 'pedido', nome: 'Abrir pedido do morador', desc: 'No portal e no WhatsApp: buraco, poste, lixo, com protocolo.', padrao: [false, false, false, true] },
    { id: 'voz', nome: 'Falar e ouvir', desc: 'Microfone e leitura das respostas em voz alta.', padrao: [true, true, true, true] },
    { id: 'publicar', nome: 'Publicar sem aprovação de uma pessoa', desc: 'Nunca: todo post da Maia passa pela agenda de publicação.', padrao: [false, false, false, false], trava: true },
    { id: 'pessoal', nome: 'Mostrar dado pessoal identificável', desc: 'Nunca (LGPD): nome, CPF, endereço ou saúde de uma pessoa ficam fora das respostas.', padrao: [false, false, false, false], trava: true },
  ];
  const PERFIS = ['Gestor geral', 'Secretaria', 'Servidor', 'Cidadão'];
  function config() { try { return JSON.parse(localStorage.getItem(chave())) || {}; } catch (e) { return {}; } }
  function permitido(id, i) {
    const p = PERMISSOES.find((x) => x.id === id);
    if (!p) return false;
    if (p.trava) return p.padrao[i];
    const c = config()[id];
    return Array.isArray(c) && typeof c[i] === 'boolean' ? c[i] : p.padrao[i];
  }
  GC.governancaMaia = { PERMISSOES, permitido };

  // Respostas recentes (exemplo) e ações da auditoria ligadas à Maia.
  function registro() {
    const t = agora();
    const exemplo = [
      { t: t - 0.4 * H, quem: 'Helena Prado', o: 'Respondeu: "Como está o orçamento?"', fonte: 'Orçamento e execução · há 2 h', revisado: null },
      { t: t - 1.1 * H, quem: 'Marina Costa', o: 'Escreveu rascunho de nota à imprensa sobre a UTI', fonte: 'Leitos e UTI · há 24 min', revisado: true },
      { t: t - 2.5 * H, quem: 'Morador (portal)', o: 'Abriu pedido de reparo: poste apagado · protocolo 2026-004790', fonte: 'Ocorrências e pedidos', revisado: null },
      { t: t - 3.2 * H, quem: 'Rafael Moura', o: 'Respondeu: "Quais avenidas estão lentas?"', fonte: 'Trânsito e lentidão · há 26 h (atrasada)', revisado: null, alerta: true },
      { t: t - 5 * H, quem: 'Fernanda Lima', o: 'Sugeriu cobrança à Mobilidade (semáforo apagado)', fonte: 'Ocorrências e pedidos', revisado: true },
      { t: t - 26 * H, quem: 'Helena Prado', o: 'Escreveu post: escola climatizada (publicado após aprovação)', fonte: 'Agenda de entregas', revisado: true },
    ];
    const auds = (GC.auditoria && GC.auditoria.todos ? GC.auditoria.todos() : []).filter((a) => /^(oficio_maia|publicacao_|plano_pdf|orcamento_regras|maia_permissao)/.test(a.acao || '')).slice(0, 8)
      .map((a) => ({ t: a.t || a.em || t, quem: (a.usuario && a.usuario.nome) || a.pessoa || 'Gabinete', o: `${((GC.ACOES_AUDITORIA || {})[a.acao] || { nome: a.acao }).nome}${a.alvo ? `: ${a.alvo}` : ''}`, fonte: 'Auditoria', revisado: true }));
    return [...auds, ...exemplo].sort((a, b) => b.t - a.t);
  }

  function conformidade() {
    const l = [];
    (GC.fontesDados ? GC.fontesDados.atrasadas() : []).forEach((f) => l.push({ grav: 'alta', titulo: `A Maia está respondendo com dado atrasado: ${f.nome}`, texto: `Última atualização ${GC.fontesDados.tempo(f.haMin)}. As respostas avisam, mas o ideal é a fonte voltar ao prazo.`, ir: '#/fontes', botao: 'Ver a fonte' }));
    if (GC.publicacoes) {
      const p = GC.publicacoes.pendencias();
      if (p.semAprovacao.length) l.push({ grav: 'alta', titulo: `${p.semAprovacao.length} post(s) da Maia fora da fila sem aprovação registrada`, texto: 'Todo post escrito pela Maia precisa de uma pessoa aprovando.', ir: '#/publicacoes', botao: 'Ver a agenda' });
      if (p.paradas.length) l.push({ grav: 'media', titulo: `${p.paradas.length} post(s) esperando aprovação a menos de 2 dias da data`, texto: p.paradas.map((x) => x.titulo).join(' · '), ir: '#/publicacoes', botao: 'Aprovar' });
    }
    l.push({ grav: 'media', titulo: 'Rascunho com nome de paciente foi corrigido antes de sair', texto: 'Ontem, um rascunho de nota sobre a UTI trazia o nome de um paciente. A Maia trocou por "um paciente" e registrou o caso.', ir: null, botao: null, resolvido: true });
    l.push({ grav: 'baixa', titulo: 'Revisão mensal das permissões', texto: 'Confira com a Procuradoria e a Comunicação se o que a Maia pode fazer continua certo para cada perfil.', ir: null, botao: null });
    return l;
  }

  GC.criarTelaGovernanca = function (el) {
    let msg = '';
    const pode = () => (!GC.visaoDe || GC.visaoDe(GC.perfil) === 'cidade') && !(GC.visaoSimples && GC.visaoSimples.forcada());
    const quando = (t) => { const m = Math.round((agora() - t) / 60000); return m < 60 ? `há ${Math.max(1, m)} min` : m < 1440 ? `há ${Math.round(m / 60)} h` : `há ${Math.round(m / 1440)} d`; };
    function desenhar() {
      const reg = registro();
      const conf = conformidade();
      const abertos = conf.filter((c) => !c.resolvido);
      const kpi = (rot, n, texto, cls = '') => `<div class="en-kpi ${cls}"><small>${rot}</small><b>${n}</b><span>${texto}</span></div>`;
      const GRAV = { alta: 'critico', media: 'atencao', baixa: 'neutro' };
      el.innerHTML = `
        <header class="sec-topo gv-topo">
          <div><h2>${ic('robot')} Governança da Maia</h2>
            <p>O que a Maia pode fazer em cada perfil, o que ela fez e onde precisa de cuidado. A Maia sugere; quem decide é sempre uma pessoa.</p></div>
          <span class="en-topo-acoes"><a class="btn-sec" href="#/auditoria">${ic('list-search')} Auditoria completa</a></span>
        </header>
        ${msg ? `<p class="pb-msg" role="status">${ic('circle-check')} ${esc(msg)}</p>` : ''}
        <div class="en-kpis">
          ${kpi('Ações nas últimas 24 h', reg.filter((r) => agora() - r.t < 24 * 3600000).length, 'respostas, rascunhos e pedidos')}
          ${kpi('Revisadas por uma pessoa', `${reg.filter((r) => r.revisado).length}/${reg.filter((r) => r.revisado !== null).length}`, 'do que precisava de revisão', 'bom')}
          ${kpi('Alertas de conformidade', abertos.length, abertos.some((c) => c.grav === 'alta') ? 'com alerta alto' : 'nada alto', abertos.some((c) => c.grav === 'alta') ? 'ruim' : '')}
          ${kpi('Princípios travados', PERMISSOES.filter((p) => p.trava).length, 'nunca publica sozinha · nunca dado pessoal')}
        </div>
        <div class="gv-colunas">
          <section class="rel-cartao"><h3>${ic('alert-triangle')} Conformidade <small>${abertos.length} em aberto</small></h3>
            <ul class="gv-conf">${conf.map((c) => `<li class="${GRAV[c.grav]}${c.resolvido ? ' resolvido' : ''}">
              <span class="oc-selo ${c.resolvido ? 'ok' : GRAV[c.grav]}">${c.resolvido ? 'Resolvido' : c.grav === 'alta' ? 'Alto' : c.grav === 'media' ? 'Médio' : 'Baixo'}</span>
              <b>${esc(c.titulo)}</b><small>${esc(c.texto)}</small>${c.ir ? `<a class="btn-sec oc-mini-bt" href="${c.ir}">${esc(c.botao)} ${ic('arrow-right')}</a>` : ''}</li>`).join('')}</ul>
          </section>
          <section class="rel-cartao"><h3>${ic('history')} O que a Maia fez <small>últimas ações</small></h3>
            <ul class="gv-reg">${reg.slice(0, 9).map((r) => `<li${r.alerta ? ' class="alerta"' : ''}><span class="gv-quando">${esc(quando(r.t))}</span>
              <span><b>${esc(r.o)}</b><small>${esc(r.quem)} · fonte: ${esc(r.fonte)}${r.revisado === true ? ' · revisado' : ''}</small></span></li>`).join('')}</ul>
          </section>
        </div>
        <section class="rel-cartao"><h3>${ic('lock-access')} O que a Maia pode fazer <small>${pode() ? 'clique para ligar ou desligar' : 'só o gestor geral muda'}</small></h3>
          <div class="ft-tabela-caixa"><table class="sec-tabela gv-perm">
            <thead><tr><th>Ação</th>${PERFIS.map((p) => `<th class="num">${esc(p)}</th>`).join('')}</tr></thead>
            <tbody>${PERMISSOES.map((p) => `<tr${p.trava ? ' class="trava"' : ''}><td><b>${esc(p.nome)}</b>${p.trava ? ` <span class="gv-trava">${ic('lock')} princípio</span>` : ''}<small>${esc(p.desc)}</small></td>
              ${PERFIS.map((_, i) => { const on = permitido(p.id, i); return `<td class="num"><button type="button" class="gv-chave${on ? ' on' : ''}" role="switch" aria-checked="${on}" aria-label="${esc(p.nome)} · ${esc(PERFIS[i])}" data-gv="${p.id}" data-gv-i="${i}"${p.trava || !pode() ? ' disabled' : ''}><span></span></button></td>`; }).join('')}</tr>`).join('')}</tbody>
          </table></div>
          <p class="oc-nota">${ic('info-circle')} Toda resposta da Maia mostra a fonte e a hora do dado (Fontes e integrações). Rascunhos nunca saem sem uma pessoa revisar.</p>
        </section>`;
    }
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-gv]');
      if (!b || b.disabled || !pode()) return;
      const p = PERMISSOES.find((x) => x.id === b.dataset.gv);
      const i = Number(b.dataset.gvI);
      const c = config();
      const atual = p.padrao.map((v, k) => permitido(p.id, k));
      atual[i] = !atual[i];
      c[p.id] = atual;
      try { localStorage.setItem(chave(), JSON.stringify(c)); } catch (er) { /* vale até recarregar */ }
      msg = `${p.nome} · ${PERFIS[i]}: ${atual[i] ? 'ligado' : 'desligado'}.`;
      if (GC.auditar) GC.auditar('maia_permissao', { alvo: `${p.nome} · ${PERFIS[i]}`, detalhe: atual[i] ? 'Ligou' : 'Desligou' });
      desenhar();
    });
    return { mostrar() { msg = ''; desenhar(); }, atualizar() { /* muda pelos próprios botões */ } };
  };
})(window.GC = window.GC || {});
