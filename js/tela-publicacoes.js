(function (GC) {
  // Agenda de publicação (pauta do Paulo Fiuza, item 5): os posts e comunicados da prefeitura nas redes, do rascunho
  // à publicação. Rota #/publicacoes.
  //   - Os posts que a Maia escreve (js/ia/rascunhos.js, tipo 'post') entram aqui como rascunho, esperando aprovação.
  //   - Nada sai sem uma pessoa aprovar: a Maia sugere, a Comunicação aprova, o post vai para a data marcada.
  //   - Calendário de duas semanas, a fila de aprovação e o formulário de post novo.
  // Guardado por cidade (gc.publicacoes.<cidade>); a demonstração começa com uma semana de posts. "Publicar" é simulado.
  const ic = (n) => `<i class="ti ti-${n}" aria-hidden="true"></i>`;
  const esc = (t) => (GC.escaparHtml ? GC.escaparHtml(t) : String(t));
  const H = 3600000;
  const D = 24 * H;
  const agora = () => (GC.agora ? GC.agora() : Date.now());
  const chave = () => `gc.publicacoes.${GC.cidade ? GC.cidade.id : 'media'}`;
  GC.CANAIS_PUBLICACAO = {
    instagram: { nome: 'Instagram', icone: 'brand-instagram' },
    facebook: { nome: 'Facebook', icone: 'brand-facebook' },
    whatsapp: { nome: 'Canal do WhatsApp', icone: 'brand-whatsapp' },
    site: { nome: 'Site da prefeitura', icone: 'world' },
    x: { nome: 'X', icone: 'brand-x' },
  };
  GC.ESTADOS_PUBLICACAO = {
    aprovacao: { nome: 'Esperando aprovação', cls: 'atencao' },
    agendado: { nome: 'Agendado', cls: 'ok' },
    publicado: { nome: 'Publicado', cls: 'neutro' },
    descartado: { nome: 'Descartado', cls: 'neutro' },
  };

  function semente() {
    const t = agora();
    const dia = (n, h) => { const d = new Date(t + n * D); d.setHours(h, 0, 0, 0); return d.getTime(); };
    const cidade = (GC.cidade && GC.cidade.nome) || 'Vila Dourada';
    return [
      { id: 'pb-1', titulo: 'Alerta de chuva forte', texto: `Previsão de chuva forte em ${cidade} até amanhã. Evite áreas alagadas e, em perigo, ligue 199.`, canais: ['instagram', 'whatsapp', 'site'], quando: dia(0, 18), estado: 'agendado', area: 'defesa_civil', origem: 'maia', aprovadoPor: 'Comunicação' },
      { id: 'pb-2', titulo: 'Mutirão de matrícula', texto: 'Matrícula da rede municipal pelo portal, com gov.br. Escolas com vaga no mapa.', canais: ['instagram', 'facebook'], quando: dia(1, 10), estado: 'agendado', area: 'educacao', origem: 'pessoa', aprovadoPor: 'Comunicação' },
      { id: 'pb-3', titulo: 'Recapeamento da Av. Dourada', texto: 'Obra de recapeamento entra na fase final nesta semana. Desvio pela Rua XV.', canais: ['facebook', 'site'], quando: dia(2, 9), estado: 'aprovacao', area: 'infraestrutura', origem: 'maia' },
      { id: 'pb-4', titulo: 'Vacinação contra a gripe', texto: 'Postos de saúde vacinam de segunda a sexta, das 8h às 17h. Leve a carteirinha.', canais: ['instagram', 'whatsapp'], quando: dia(3, 11), estado: 'aprovacao', area: 'saude', origem: 'maia' },
      { id: 'pb-5', titulo: 'Refis do IPTU', texto: 'Até 30/12, quite o IPTU em atraso com até 90% de desconto nos juros. Simule no portal.', canais: ['instagram', 'facebook', 'site'], quando: dia(4, 12), estado: 'agendado', area: null, origem: 'pessoa', aprovadoPor: 'Gabinete' },
      { id: 'pb-6', titulo: 'Coleta no feriado', texto: 'A coleta de lixo funciona normalmente no feriado. A seletiva volta na segunda.', canais: ['whatsapp', 'site'], quando: dia(6, 8), estado: 'agendado', area: 'limpeza', origem: 'maia', aprovadoPor: 'Comunicação' },
      { id: 'pb-7', titulo: 'Escola Alto da Serra climatizada', texto: 'Entregamos a climatização da Escola Alto da Serra: 18 salas com ar-condicionado.', canais: ['instagram', 'facebook'], quando: dia(-2, 15), estado: 'publicado', area: 'educacao', origem: 'maia', aprovadoPor: 'Comunicação', alcance: 4210 },
      { id: 'pb-8', titulo: 'Semáforos da Av. do Porto', texto: 'Os semáforos da Av. do Porto voltaram a funcionar. Obrigado pela paciência.', canais: ['x', 'facebook'], quando: dia(-1, 19), estado: 'publicado', area: 'mobilidade', origem: 'pessoa', aprovadoPor: 'Comunicação', alcance: 2380 },
      { id: 'pb-9', titulo: 'Feira de empregos', texto: 'Feira de empregos no Centro, sábado, das 9h às 15h. Leve o currículo.', canais: ['instagram'], quando: dia(9, 10), estado: 'aprovacao', area: null, origem: 'pessoa' },
    ];
  }
  function ler() {
    try { const v = JSON.parse(localStorage.getItem(chave())); if (Array.isArray(v)) return v; } catch (e) { /* recomeça */ }
    const s = semente();
    gravar(s);
    return s;
  }
  function gravar(l) { try { localStorage.setItem(chave(), JSON.stringify(l)); } catch (e) { /* vale até recarregar */ } }
  const ouvintes = new Set();
  const avisar = () => ouvintes.forEach((f) => f());

  const api = {
    lista: () => ler().filter((p) => p.estado !== 'descartado').sort((a, b) => a.quando - b.quando),
    // Post escrito pela Maia: entra esperando aprovação, para amanhã às 10h (o mesmo texto não entra duas vezes).
    daMaia(d) {
      const l = ler();
      if (l.some((p) => p.texto === d.texto)) return null;
      const q = new Date(agora() + D); q.setHours(10, 0, 0, 0);
      const p = { id: `pb-${Date.now().toString(36)}`, titulo: `Post · ${String(d.titulo || 'Prefeitura').replace(/^Post para redes sociais · /, '')}`, texto: d.curto || d.texto, canais: ['instagram', 'facebook'], quando: q.getTime(), estado: 'aprovacao', area: d.area || null, origem: 'maia' };
      l.push(p); gravar(l); avisar();
      return p;
    },
    criar(dados) {
      const l = ler();
      const p = Object.assign({ id: `pb-${Date.now().toString(36)}`, origem: 'pessoa', estado: 'aprovacao' }, dados);
      l.push(p); gravar(l); avisar();
      if (GC.auditar) GC.auditar('publicacao_criar', { alvo: p.titulo, detalhe: new Date(p.quando).toLocaleString('pt-BR') });
      return p;
    },
    mudar(id, estado, extra = {}) {
      const l = ler();
      const p = l.find((x) => x.id === id);
      if (!p) return null;
      Object.assign(p, { estado }, extra);
      gravar(l); avisar();
      if (GC.auditar) GC.auditar(`publicacao_${estado === 'agendado' ? 'aprovar' : estado === 'publicado' ? 'publicar' : 'descartar'}`, { alvo: p.titulo });
      return p;
    },
    ouvir: (f) => { ouvintes.add(f); return () => ouvintes.delete(f); },
    // Para a governança da Maia: posts da Maia publicados sem aprovação (não deveria haver) e esperando há mais de 2 dias.
    pendencias() {
      const l = api.lista();
      return {
        semAprovacao: l.filter((p) => p.estado !== 'aprovacao' && p.origem === 'maia' && !p.aprovadoPor),
        paradas: l.filter((p) => p.estado === 'aprovacao' && p.quando - agora() < 2 * D),
      };
    },
  };
  GC.publicacoes = api;

  // ---------- tela ----------
  GC.criarTelaPublicacoes = function (el) {
    let semana = 0; // 0 = esta semana, 1 = a próxima
    let novo = false;
    let msg = '';
    const nomeArea = (id) => (id ? ((GC.data.areas || []).find((a) => a.id === id) || { nome: id }).nome : 'Prefeitura');
    const ehGestorGeral = () => !GC.visaoDe || GC.visaoDe(GC.perfil) === 'cidade';
    const podeAprovar = () => ehGestorGeral() && !(GC.visaoSimples && GC.visaoSimples.forcada());
    const hora = (t) => new Date(t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const dataCurta = (t) => new Date(t).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' });
    const canais = (p) => p.canais.map((c) => `<span class="pb-canal" title="${esc(GC.CANAIS_PUBLICACAO[c].nome)}">${ic(GC.CANAIS_PUBLICACAO[c].icone)}</span>`).join('');

    function cartao(p, { acoes = true } = {}) {
      const e = GC.ESTADOS_PUBLICACAO[p.estado];
      const botoes = [];
      if (acoes && p.estado === 'aprovacao' && podeAprovar()) botoes.push(`<button type="button" class="btn-sec principal" data-pb="aprovar" data-pb-id="${p.id}">${ic('check')} Aprovar e agendar</button>`, `<button type="button" class="btn-sec" data-pb="descartar" data-pb-id="${p.id}">Descartar</button>`);
      if (acoes && p.estado === 'agendado' && podeAprovar()) botoes.push(`<button type="button" class="btn-sec" data-pb="publicar" data-pb-id="${p.id}">${ic('send')} Publicar agora</button>`, `<button type="button" class="btn-sec" data-pb="voltar" data-pb-id="${p.id}">Tirar da agenda</button>`);
      return `<li class="pb-post ${e.cls}">
        <div class="pb-post-cab"><span class="pb-quando">${ic('calendar-time')} ${esc(dataCurta(p.quando))}, ${esc(hora(p.quando))}</span>
          <span class="oc-selo ${e.cls}">${esc(e.nome)}</span>${p.origem === 'maia' ? `<span class="pb-maia">${ic('sparkles')} escrito pela Maia</span>` : ''}</div>
        <b>${esc(p.titulo)}</b><p>${esc(p.texto)}</p>
        <div class="pb-post-pe"><span class="pb-canais">${canais(p)}</span><small>${esc(nomeArea(p.area))}${p.aprovadoPor ? ` · aprovado por ${esc(p.aprovadoPor)}` : ''}${p.alcance ? ` · ${p.alcance.toLocaleString('pt-BR')} pessoas alcançadas` : ''}</small></div>
        ${botoes.length ? `<div class="pb-botoes">${botoes.join('')}</div>` : ''}
      </li>`;
    }

    function desenhar() {
      const l = api.lista();
      const t = agora();
      const ini = new Date(t); ini.setHours(0, 0, 0, 0); ini.setDate(ini.getDate() - ((ini.getDay() + 6) % 7) + semana * 7);
      const dias = Array.from({ length: 7 }, (_, i) => ini.getTime() + i * D);
      const daSemana = (a, b) => l.filter((p) => p.quando >= a && p.quando < b);
      const esta = daSemana(ini.getTime(), ini.getTime() + 7 * D);
      const fila = l.filter((p) => p.estado === 'aprovacao');
      const agendados = l.filter((p) => p.estado === 'agendado' && p.quando >= t);
      const publicados = l.filter((p) => p.estado === 'publicado' && p.quando >= t - 30 * D);
      const kpi = (rot, n, texto, cls = '') => `<div class="en-kpi ${cls}"><small>${rot}</small><b>${n}</b><span>${texto}</span></div>`;
      const nomeDia = (d) => new Date(d).toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '');
      const hoje = new Date(t); hoje.setHours(0, 0, 0, 0);
      const amanha = new Date(t + D); amanha.setHours(10, 0, 0, 0);
      const valorData = new Date(amanha.getTime() - amanha.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
      el.innerHTML = `
        <header class="sec-topo pb-topo">
          <div><h2>${ic('speakerphone')} Agenda de publicação</h2>
            <p>O que a prefeitura vai postar nas redes e no site, quando e em que canal. A Maia escreve, uma pessoa aprova, o post sai na data marcada.</p></div>
          <span class="en-topo-acoes">
            <button type="button" class="btn-sec principal" data-pb="novo">${ic('plus')} Novo post</button>
            <button type="button" class="btn-sec btn-maia-tela" data-maia="Escreva a legenda do post para as redes sociais"><i class="ti ti-sparkles" aria-hidden="true"></i> Post com a Maia</button>
          </span>
        </header>
        ${msg ? `<p class="pb-msg" role="status">${ic('circle-check')} ${esc(msg)}</p>` : ''}
        ${novo ? `<form class="rel-cartao pb-form" data-pb-form>
            <h3>${ic('pencil')} Post novo</h3>
            <label>Título <input name="titulo" required maxlength="80" placeholder="Ex.: Vacinação no sábado"></label>
            <label>Texto <textarea name="texto" required rows="3" maxlength="600" placeholder="O que a população precisa saber, em linguagem simples."></textarea></label>
            <div class="pb-form-linha"><label>Quando <input type="datetime-local" name="quando" value="${valorData}" required></label>
              <label>Secretaria <select name="area"><option value="">Prefeitura</option>${(GC.data.areas || []).map((a) => `<option value="${a.id}">${esc(a.nome)}</option>`).join('')}</select></label></div>
            <fieldset class="pb-canais-form"><legend>Canais</legend>${Object.entries(GC.CANAIS_PUBLICACAO).map(([id, c]) => `<label class="mv-check"><input type="checkbox" name="canal" value="${id}"${id === 'instagram' || id === 'facebook' ? ' checked' : ''}> ${ic(c.icone)} ${esc(c.nome)}</label>`).join('')}</fieldset>
            <p class="pb-dica">${ic('info-circle')} ${podeAprovar() ? 'Você aprova: o post já entra agendado.' : 'O post entra esperando a aprovação do gabinete ou da Comunicação.'}</p>
            <div class="pb-botoes"><button type="submit" class="btn-sec principal">${ic('calendar-plus')} Salvar na agenda</button><button type="button" class="btn-sec" data-pb="cancelar">Cancelar</button></div>
          </form>` : ''}
        <div class="en-kpis">
          ${kpi('Nesta semana', esta.length, `${esta.filter((p) => p.estado === 'publicado').length} já publicados`)}
          ${kpi('Esperando aprovação', fila.length, fila.length ? `${fila.filter((p) => p.origem === 'maia').length} escritos pela Maia` : 'fila vazia', fila.length ? 'ruim' : 'bom')}
          ${kpi('Agendados', agendados.length, agendados[0] ? `próximo: ${dataCurta(agendados[0].quando)}, ${hora(agendados[0].quando)}` : 'nenhum à frente')}
          ${kpi('Publicados em 30 dias', publicados.length, `${publicados.reduce((s, p) => s + (p.alcance || 0), 0).toLocaleString('pt-BR')} pessoas alcançadas`, 'bom')}
        </div>
        <section class="rel-cartao pb-semana">
          <div class="pb-semana-cab"><h3>${ic('calendar-week')} ${semana === 0 ? 'Esta semana' : 'Próxima semana'} <small>${esc(new Date(dias[0]).toLocaleDateString('pt-BR'))} a ${esc(new Date(dias[6]).toLocaleDateString('pt-BR'))}</small></h3>
            <span class="pb-nav"><button type="button" class="btn-sec oc-mini-bt" data-pb="semana" data-pb-s="0"${semana === 0 ? ' aria-pressed="true"' : ''}>Esta</button><button type="button" class="btn-sec oc-mini-bt" data-pb="semana" data-pb-s="1"${semana === 1 ? ' aria-pressed="true"' : ''}>Próxima</button></span></div>
          <ol class="pb-dias">${dias.map((d) => {
            const ps = daSemana(d, d + D);
            return `<li class="pb-dia${d === hoje.getTime() ? ' hoje' : ''}"><span class="pb-dia-nome">${esc(nomeDia(d))} <b>${new Date(d).getDate()}</b></span>
              ${ps.map((p) => `<span class="pb-chip ${GC.ESTADOS_PUBLICACAO[p.estado].cls}" title="${esc(GC.ESTADOS_PUBLICACAO[p.estado].nome)}: ${esc(p.titulo)}"><small>${esc(hora(p.quando))}</small>${esc(p.titulo)}<span class="pb-canais">${canais(p)}</span></span>`).join('') || '<span class="pb-vazio">—</span>'}</li>`;
          }).join('')}</ol>
          <p class="oc-legenda"><span class="pb-l atencao"></span>esperando aprovação <span class="pb-l ok"></span>agendado <span class="pb-l neutro"></span>publicado</p>
        </section>
        <div class="pb-colunas">
          <section class="rel-cartao"><h3>${ic('checklist')} Esperando aprovação <small>${fila.length}</small></h3>
            ${fila.length ? `<ul class="pb-lista">${fila.map((p) => cartao(p)).join('')}</ul>` : `<p class="oc-vazio">${ic('circle-check')} Nada esperando aprovação.</p>`}</section>
          <section class="rel-cartao"><h3>${ic('calendar-check')} Próximos agendados <small>${agendados.length}</small></h3>
            ${agendados.length ? `<ul class="pb-lista">${agendados.slice(0, 6).map((p) => cartao(p)).join('')}</ul>` : '<p class="oc-vazio">Nenhum post agendado.</p>'}</section>
        </div>
        <section class="rel-cartao"><h3>${ic('history')} Publicados <small>últimos 30 dias</small></h3>
          ${publicados.length ? `<ul class="pb-lista pb-lista-linha">${publicados.slice().reverse().map((p) => cartao(p, { acoes: false })).join('')}</ul>` : '<p class="oc-vazio">Nada publicado nos últimos 30 dias.</p>'}</section>`;
    }

    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-pb]');
      if (!b || !el.contains(b)) return;
      const a = b.dataset.pb;
      const id = b.dataset.pbId;
      msg = '';
      if (a === 'novo') { novo = true; desenhar(); const f = el.querySelector('[name="titulo"]'); if (f) f.focus(); return; }
      if (a === 'cancelar') novo = false;
      if (a === 'semana') semana = Number(b.dataset.pbS) || 0;
      if (a === 'aprovar') { api.mudar(id, 'agendado', { aprovadoPor: (GC.usuarioAtual && GC.usuarioAtual() && GC.usuarioAtual().nome) || 'Gabinete' }); msg = 'Aprovado: o post entrou na agenda.'; }
      if (a === 'descartar') { api.mudar(id, 'descartado'); msg = 'Post descartado.'; }
      if (a === 'publicar') { api.mudar(id, 'publicado', { quando: agora(), alcance: 0 }); msg = 'Publicado (simulação da demonstração).'; }
      if (a === 'voltar') { api.mudar(id, 'aprovacao', { aprovadoPor: null }); msg = 'O post voltou para a fila de aprovação.'; }
      desenhar();
    });
    el.addEventListener('submit', (e) => {
      const f = e.target.closest('[data-pb-form]');
      if (!f) return;
      e.preventDefault();
      const d = new FormData(f);
      const canaisSel = d.getAll('canal');
      if (!canaisSel.length) { msg = 'Escolha pelo menos um canal.'; desenhar(); return; }
      const aprova = podeAprovar();
      api.criar({ titulo: String(d.get('titulo')).trim(), texto: String(d.get('texto')).trim(), quando: new Date(String(d.get('quando'))).getTime(), area: d.get('area') || null, canais: canaisSel, estado: aprova ? 'agendado' : 'aprovacao', aprovadoPor: aprova ? ((GC.usuarioAtual && GC.usuarioAtual() && GC.usuarioAtual().nome) || 'Gabinete') : null });
      novo = false;
      msg = aprova ? 'Post salvo e agendado.' : 'Post salvo: espera a aprovação.';
      desenhar();
    });
    api.ouvir(() => { if (!el.hidden) desenhar(); });
    return { mostrar() { desenhar(); }, atualizar() { /* a agenda só muda pelos próprios botões ou pela Maia (ouvir) */ } };
  };
})(window.GC = window.GC || {});
