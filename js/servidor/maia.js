(function (GC) {
  // Maia no portal do servidor (servidor.html): roteirizada, como a do portal do cidadão. Só fala do que é da pessoa
  // (as demandas passadas a ela e as salas de crise em que está); o resto é do painel da gestão. Quatro pedidos prontos
  // (GC.ACOES_MAIA_SERVIDOR) e o texto livre, que só serve para achar qual deles a pessoa quer.
  // O "Maia" do texto é trocado pelo nome da assistente da Prefeitura (js/personalizacao.js).
  // Spec: docs/specs/2026-11-17-vila-dourada-portal-do-servidor-design.md (fase 2).
  const MIN = 60000;
  const sem = (t) => String(t == null ? '' : t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

  GC.ACOES_MAIA_SERVIDOR = [
    { id: 'hoje', rotulo: 'O que tenho para hoje?', icone: 'list-check' },
    { id: 'sala', rotulo: 'Resumir a sala de crise', icone: 'urgent' },
    { id: 'noticia', rotulo: 'Escrever a notícia de uma demanda', icone: 'message-2' },
    { id: 'perguntas', rotulo: 'O que a sala ainda pergunta?', icone: 'help-hexagon' },
  ];
  const PALAVRAS = {
    perguntas: ['pergunta', 'questao', 'questoes', 'quer saber', 'duvida'],
    sala: ['sala', 'gabinete', 'crise', 'emergencia'],
    noticia: ['noticia', 'atualiza', 'escrever', 'redigir', 'rascunho', 'texto', 'resposta pronta'],
    hoje: ['hoje', 'fazer', 'fila', 'pendente', 'demandas', 'tarefa', 'atrasad', 'prazo', 'o que tenho'],
  };
  // O que é de gestão (fica no painel): números da cidade, metas, outras pastas, relatórios.
  const GESTAO = ['indicador', 'meta ', 'metas', 'orcamento', 'relatorio', 'satisfacao', 'secretarias', 'prefeit', 'cidade toda', 'ranking', 'leitos', 'ocorrencias da cidade', 'mapa'];
  const SAUDACAO = ['oi', 'ola', 'bom dia', 'boa tarde', 'boa noite', 'e ai', 'opa'];

  // Qual pedido a pessoa quer: 'hoje' | 'sala' | 'noticia' | 'perguntas' | 'gestao' | 'saudacao' | null.
  GC.entenderMaiaServidor = function (texto) {
    const t = ` ${sem(texto).replace(/\s+/g, ' ').trim()} `;
    if (GESTAO.some((p) => t.indexOf(p) >= 0)) return 'gestao';
    // A ordem desempata: "o que a sala pergunta" é perguntas, não o resumo da sala.
    const achado = ['perguntas', 'noticia', 'sala', 'hoje'].find((id) => PALAVRAS[id].some((p) => t.indexOf(p) >= 0));
    if (achado) return achado;
    if (SAUDACAO.some((s) => new RegExp(`[^a-z]${s}[^a-z]`).test(t))) return 'saudacao';
    return null;
  };

  const tempo = (min) => (GC.tempoTexto ? GC.tempoTexto(Math.max(1, Math.round(min))) : `${Math.round(min)} min`);
  const data = (ms) => new Date(ms).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

  // Rascunho da notícia de uma demanda, pelo que já está nela (nada inventado): a situação, a última notícia, a
  // resposta da dúvida e o prazo. A pessoa completa antes de mandar.
  GC.rascunhoNoticiaServidor = function (t, agora = GC.agora ? GC.agora() : Date.now()) {
    const hist = t.historico || [];
    const ultima = hist.filter((h) => h.tipo === 'atualizacao').pop();
    const resposta = hist.filter((h) => h.tipo === 'esclarecimento').pop();
    const partes = [];
    partes.push(t.status === 'fazendo' ? 'Em andamento.' : 'Ainda não comecei.');
    if (ultima) partes.push(`Desde a última notícia (${ultima.texto.replace(/\.$/, '')}), [conte o que avançou].`);
    else partes.push('[Conte o que já foi feito.]');
    if (resposta && (!ultima || resposta.t > ultima.t)) partes.push('Segui a orientação da resposta à minha dúvida.');
    partes.push(agora > t.prazoEm ? '[Diga quando fica pronto: o prazo já passou.]' : `Devo terminar até ${data(t.prazoEm)}.`);
    return partes.join(' ');
  };

  // Resposta: { paragrafos: [texto], itens?: [{ href, rotulo, sub }], rascunho?: { tarefaId, texto }, acoes?: true }.
  // dados: { fila (GC.filaDoServidor), tarefas (as dele, do registro), usuario, agora }.
  GC.responderMaiaServidor = function (intencao, { fila, tarefas = [], usuario = null, agora = GC.agora ? GC.agora() : Date.now() } = {}) {
    const nome = usuario ? String(usuario.nome).replace(/^(Guarda|Inspetor|Inspetora)\s+/, '').split(' ')[0] : '';
    const f = fila || { itens: [], salas: [], abertas: 0, atrasadas: 0 };
    const TIPOS = GC.TIPOS_FILA_SERVIDOR || {};
    const hrefItem = (x) => (x.gabinete
      ? `#/sala/${x.gabinete.id}${x.questao ? `/q-${x.questao.id}` : x.tarefaSala ? `/t-${x.tarefaSala.id}` : ''}`
      : `#/demandas/${x.tarefa.id}`);
    const textoItem = (x) => (x.questao ? x.questao.texto : x.tarefaSala ? x.tarefaSala.texto : x.duvida ? x.duvida.texto : x.tarefa ? x.tarefa.texto : x.gabinete.titulo);
    if (intencao === 'gestao') {
      return { paragrafos: ['Isso fica no painel da gestão. Aqui eu ajudo com as suas demandas e as salas de crise em que você está.'], acoes: true };
    }
    if (intencao === 'saudacao') return { paragrafos: [`Oi${nome ? `, ${nome}` : ''}! Posso ajudar com isto:`], acoes: true };
    if (intencao === 'hoje') {
      if (!f.itens.length) {
        return { paragrafos: [f.abertas ? `Nada esperando por você agora. Suas ${plural(f.abertas, 'demanda aberta está', 'demandas abertas estão')} em dia.` : 'Nada para hoje: nenhuma demanda aberta com você.'] };
      }
      const urgentes = f.itens.filter((x) => ['questao_gabinete', 'cobrada', 'chamado_gabinete', 'atrasada'].includes(x.tipo)).length;
      return {
        paragrafos: [`Você tem ${plural(f.itens.length, 'coisa esperando', 'coisas esperando')}${urgentes ? `, ${urgentes} ${urgentes === 1 ? 'urgente' : 'urgentes'}` : ''}. Comece por cima:`],
        itens: f.itens.slice(0, 5).map((x) => ({ href: hrefItem(x), rotulo: textoItem(x), sub: (TIPOS[x.tipo] || {}).rotulo || '' })),
      };
    }
    if (intencao === 'sala') {
      if (!f.salas.length) return { paragrafos: ['Você não está em nenhuma sala de crise agora. Quando o secretário da sua pasta chamar você, ela aparece na sua fila.'] };
      return {
        paragrafos: f.salas.map((g) => {
          const ativas = g.tarefas.filter((t) => t.status !== 'cancelada');
          const feitas = ativas.filter((t) => t.status === 'concluida').length;
          const atrasadas = ativas.filter((t) => !['concluida', 'cancelada'].includes(t.status) && agora - t.criadaEm > t.prazoMin * MIN).length;
          const minhas = ativas.filter((t) => usuario && t.responsavelId === usuario.id && t.status !== 'concluida').length;
          const semResposta = (g.perguntas || []).filter((q) => !q.resposta).length;
          const ultima = (g.registro || []).filter((r) => r.tipo === 'atualizacao').pop();
          return [
            `${g.titulo}: aberta há ${tempo((agora - g.abertoEm) / MIN)}, ${feitas} de ${ativas.length} demandas feitas${atrasadas ? `, ${plural(atrasadas, 'atrasada', 'atrasadas')}` : ''}.`,
            minhas ? `${plural(minhas, 'demanda está', 'demandas estão')} com você.` : 'Nenhuma demanda da sala está com você.',
            semResposta ? `A sala ainda tem ${plural(semResposta, 'questão sem resposta', 'questões sem resposta')}.` : '',
            ultima ? `Última atualização da equipe: "${ultima.texto}" (${ultima.quem}).` : '',
          ].filter(Boolean).join(' ');
        }),
        itens: f.salas.map((g) => ({ href: `#/sala/${g.id}`, rotulo: 'Abrir a sala', sub: g.titulo })),
      };
    }
    if (intencao === 'perguntas') {
      const qs = f.salas.flatMap((g) => GC.questoesParaServidor(g, usuario).filter((q) => !q.resposta).map((q) => ({ g, q })));
      const minhasDuvidas = f.salas.flatMap((g) => (g.duvidas || []).filter((d) => usuario && d.usuarioId === usuario.id && !d.resposta));
      if (!f.salas.length) return { paragrafos: ['Você não está em nenhuma sala de crise agora, então nenhuma questão espera por você.'] };
      const p = [qs.length ? `A sala espera ${plural(qs.length, 'resposta sua', 'respostas suas')} (ou da sua pasta):` : 'Nenhuma questão da sala espera por você agora.'];
      if (minhasDuvidas.length) p.push(`E ${plural(minhasDuvidas.length, 'dúvida sua ainda espera', 'dúvidas suas ainda esperam')} resposta da sala.`);
      return { paragrafos: p, itens: qs.map(({ g, q }) => ({ href: `#/sala/${g.id}/q-${q.id}`, rotulo: q.texto, sub: g.titulo })) };
    }
    if (intencao === 'noticia') {
      const abertas = tarefas.filter(GC.tarefaAberta);
      if (!abertas.length) return { paragrafos: ['Você não tem demanda aberta para dar notícia.'] };
      // A que pediram notícia primeiro; depois a cobrada; depois a que vence antes.
      const t = abertas.slice().sort((a, b) => (b.atualizacaoPedidaEm ? 1 : 0) - (a.atualizacaoPedidaEm ? 1 : 0)
        || (b.respostaPendente ? 1 : 0) - (a.respostaPendente ? 1 : 0) || a.prazoEm - b.prazoEm)[0];
      return {
        paragrafos: [`Um rascunho para "${t.texto}"${t.atualizacaoPedidaEm ? ' (pediram notícia dela)' : ''}. Complete o que está entre colchetes antes de mandar:`],
        rascunho: { tarefaId: t.id, texto: GC.rascunhoNoticiaServidor(t, agora) },
        itens: abertas.filter((x) => x.id !== t.id).slice(0, 3).map((x) => ({ href: `#/demandas/${x.id}`, rotulo: x.texto, sub: 'Outra demanda aberta' })),
      };
    }
    return { paragrafos: ['Não entendi. Posso ajudar com isto:'], acoes: true };
  };

  // ---------- conversa (DOM) ----------
  // ctx: { $, esc, ic, dados() → { fila, tarefas, usuario, agora }, usarRascunho(tarefaId, texto) }
  GC.criarMaiaServidor = function (ctx) {
    const { $, esc, ic } = ctx;
    const painel = $('sv-maia');
    const abrirBtn = $('sv-maia-abrir');
    if (!painel || !abrirBtn) return null;
    const log = $('sv-maia-log');
    const form = $('sv-maia-form');
    const campo = $('sv-maia-campo');
    const rosto = '<span class="maia-rosto" aria-hidden="true"></span>';
    const opcoes = () => `<div class="sv-maia-opcoes">${GC.ACOES_MAIA_SERVIDOR.map((a) => `<button type="button" class="sv-maia-opcao" data-maia-acao="${a.id}">${ic(a.icone)} ${esc(a.rotulo)}</button>`).join('')}</div>`;
    let rascunhoAtual = null;
    function dela(r) {
      rascunhoAtual = r.rascunho || null;
      const html = `${r.paragrafos.map((p) => `<p>${esc(p)}</p>`).join('')}
        ${r.rascunho ? `<p class="sv-maia-rascunho">${esc(r.rascunho.texto)}</p><button type="button" class="sv-btn" data-maia-usar>${ic('pencil')} Usar na demanda</button>` : ''}
        ${r.itens && r.itens.length ? `<div class="sv-maia-itens">${r.itens.map((x) => `<a href="${esc(x.href)}" class="sv-maia-item" data-maia-ir><b>${esc(x.rotulo)}</b>${x.sub ? `<small>${esc(x.sub)}</small>` : ''}</a>`).join('')}</div>` : ''}
        ${r.acoes ? opcoes() : ''}`;
      log.insertAdjacentHTML('beforeend', `<li class="sv-maia-msg dela">${rosto}<div class="sv-maia-balao">${html}</div></li>`);
      log.scrollTop = log.scrollHeight;
    }
    const minha = (t) => { log.insertAdjacentHTML('beforeend', `<li class="sv-maia-msg minha"><div class="sv-maia-balao">${esc(t)}</div></li>`); };
    const responder = (intencao) => dela(GC.responderMaiaServidor(intencao, ctx.dados()));
    function abrir() {
      painel.hidden = false;
      abrirBtn.setAttribute('aria-expanded', 'true');
      document.body.classList.add('sv-com-maia');
      if (!log.children.length) responder('saudacao');
      campo.focus();
    }
    function fechar() {
      painel.hidden = true;
      abrirBtn.setAttribute('aria-expanded', 'false');
      document.body.classList.remove('sv-com-maia');
      abrirBtn.focus();
    }
    abrirBtn.addEventListener('click', () => (painel.hidden ? abrir() : fechar()));
    $('sv-maia-fechar').addEventListener('click', fechar);
    painel.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); fechar(); } });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const t = campo.value.trim();
      if (!t) return;
      campo.value = '';
      minha(t);
      responder(GC.entenderMaiaServidor(t));
    });
    painel.addEventListener('click', (e) => {
      const a = e.target.closest('[data-maia-acao]');
      if (a) { const def = GC.ACOES_MAIA_SERVIDOR.find((x) => x.id === a.dataset.maiaAcao); minha(def.rotulo); responder(def.id); return; }
      if (e.target.closest('[data-maia-usar]') && rascunhoAtual) { fechar(); ctx.usarRascunho(rascunhoAtual.tarefaId, rascunhoAtual.texto); return; }
      if (e.target.closest('[data-maia-ir]') && window.matchMedia && window.matchMedia('(max-width: 719px)').matches) fechar(); // no celular, a folha cobre a página
    });
    return { abrir, fechar };
  };
})(window.GC = window.GC || {});
