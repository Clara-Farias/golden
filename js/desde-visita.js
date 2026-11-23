(function (GC) {
  // "Desde a sua última visita": o cartão da doca do mapa (ao lado do Resumo do dia e da semana) com o que mudou
  // enquanto a pessoa esteve fora: ocorrências novas, resolvidas, as que andaram (linha do tempo ou resposta à
  // cobrança) e os indicadores que trocaram de situação. A visita é guardada por cidade e pessoa
  // (gc.visitaMapa.<cidade>.<usuário>, com a foto dos indicadores) e lida uma vez, ao abrir o painel.
  const esc = (t) => GC.escaparHtml(t);
  const nomeArea = (id) => (GC.data.areas.find((a) => a.id === id) || { nome: id }).nome;
  const nomeBairro = (id) => (GC.data.bairros.find((b) => b.id === id) || { nome: id || 'cidade inteira' }).nome;
  const ORDEM_SEV = { critica: 0, alta: 1, media: 2, baixa: 3 };
  const SEV = { critica: 'Crítica', alta: 'Alta', media: 'Média', baixa: 'Baixa' };
  const SIT = { ok: 'na meta', atencao: 'perto da meta', critico: 'fora da meta' };
  const MIN = 60000;
  // Primeira visita (nada guardado): mostra as últimas horas, dito no título.
  GC.JANELA_PRIMEIRA_VISITA_MIN = 8 * 60;
  // Fora por mais que isto: o cartão abre sozinho ao entrar (recarregar a página não abre de novo).
  GC.AUSENCIA_ABRE_DESDE_VISITA_MIN = 30;
  const MAX_LISTA = 4;

  // Só dados → objeto pronto para o cartão (testável sem DOM).
  // ocorrencias: todas (abertas e resolvidas) já no recorte; resolvidasRecentes: as do histórico da demo ({ titulo,
  // area, bairroId, haMin }); indicadores: os avaliados agora; fotoIndicadores: { id: situação } da visita anterior.
  GC.desdeAUltimaVisita = function ({ ocorrencias = [], resolvidasRecentes = [], indicadores = [], fotoIndicadores = null, desde = null, agora = Date.now() }) {
    const primeira = !desde;
    const marco = primeira ? agora - GC.JANELA_PRIMEIRA_VISITA_MIN * MIN : desde;
    const item = (o, extra = {}) => Object.assign({ id: o.id, titulo: o.titulo, severidade: o.severidade, area: o.area, bairroId: o.bairroId, bairro: nomeBairro(o.bairroId), secretaria: nomeArea(o.area) }, extra);

    // Novas: abertas depois da visita (ainda abertas ou já resolvidas), a mais grave e a mais recente primeiro.
    const novas = ocorrencias.filter((o) => o.criadaEm > marco)
      .sort((a, b) => (ORDEM_SEV[a.severidade] ?? 9) - (ORDEM_SEV[b.severidade] ?? 9) || b.criadaEm - a.criadaEm)
      .map((o) => item(o, { resolvida: o.status === 'resolvida' }));
    // Resolvidas: as da store e as do histórico recente da demo (sem ocorrência por trás, sem clique).
    const resolvidas = ocorrencias.filter((o) => o.status === 'resolvida' && o.resolvidaEm > marco)
      .sort((a, b) => b.resolvidaEm - a.resolvidaEm).map((o) => item(o, { em: o.resolvidaEm }))
      .concat(resolvidasRecentes.filter((r) => agora - (r.haMin || 0) * MIN > marco)
        .map((r) => ({ id: null, titulo: r.titulo, area: r.area, bairro: nomeBairro(r.bairroId), secretaria: nomeArea(r.area), em: agora - (r.haMin || 0) * MIN })))
      .sort((a, b) => b.em - a.em);
    // Andaram: abertas antes da visita e ainda abertas, com registro novo (o mesmo critério da Central).
    const antigas = ocorrencias.filter((o) => o.criadaEm <= marco && o.status !== 'resolvida');
    const mudou = GC.novidadesDesde ? GC.novidadesDesde(antigas, marco) : new Map();
    const andaram = antigas.filter((o) => mudou.has(o.id))
      .map((o) => item(o, { texto: mudou.get(o.id).texto, t: ((o.linhaTempo || []).filter((x) => x.t > marco).pop() || {}).t || marco }))
      .sort((a, b) => b.t - a.t);
    // Indicadores: só a troca entre situações com dado (sem_dado não é melhora nem piora).
    const mud = GC.mudancasIndicadores ? GC.mudancasIndicadores(indicadores, fotoIndicadores) : {};
    const ind = indicadores.filter((i) => mud[i.id] && SIT[mud[i.id].de] && SIT[mud[i.id].para])
      .map((i) => ({ id: i.id, nome: i.nome, area: i.area || null, de: mud[i.id].de, para: mud[i.id].para, melhorou: mud[i.id].melhorou }))
      .sort((a, b) => Number(a.melhorou) - Number(b.melhorou)); // pioras primeiro

    // Bairros com mais novas (para destacar no mapa: dado agregado, nunca o ponto de uma pessoa).
    const porBairro = {};
    novas.forEach((o) => { if (o.bairroId) porBairro[o.bairroId] = (porBairro[o.bairroId] || 0) + 1; });
    const bairros = Object.keys(porBairro).sort((a, b) => porBairro[b] - porBairro[a]);

    const total = novas.length + resolvidas.length + andaram.length + ind.length;
    return {
      primeira,
      desde: marco,
      quando: primeira ? `nas últimas ${GC.JANELA_PRIMEIRA_VISITA_MIN / 60} horas` : GC.desdeVisitaTexto(marco, agora),
      total,
      contagem: {
        novas: novas.length,
        criticas: novas.filter((o) => o.severidade === 'critica' && !o.resolvida).length,
        resolvidas: resolvidas.length,
        andaram: andaram.length,
        indicadores: ind.length,
        pioraram: ind.filter((i) => !i.melhorou).length,
      },
      novas: novas.slice(0, MAX_LISTA),
      resolvidas: resolvidas.slice(0, MAX_LISTA),
      andaram: andaram.slice(0, MAX_LISTA),
      indicadores: ind.slice(0, MAX_LISTA),
      bairros,
    };
  };

  // "há 3 h (ontem, 18:40)": quanto tempo e quando, para o subtítulo do cartão.
  GC.desdeVisitaTexto = function (desde, agora = Date.now()) {
    const min = Math.max(0, Math.round((agora - desde) / MIN));
    const ha = min < 1 ? 'agora há pouco' : min < 60 ? `há ${min} min` : min < 48 * 60 ? `há ${Math.round(min / 60)} h` : `há ${Math.round(min / 1440)} dias`;
    const d = new Date(desde);
    const hoje = new Date(agora);
    const ontem = new Date(agora - 86400000);
    const mesmoDia = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
    const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const dia = mesmoDia(d, hoje) ? `hoje, ${hora}` : mesmoDia(d, ontem) ? `ontem, ${hora}` : `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}, ${hora}`;
    return `${ha} (${dia})`;
  };

  // ---- a visita guardada: { t, ind } por cidade e pessoa ----
  GC.registroVisitaMapa = function ({ cidade = 'media', usuario = 'demo', armazenamento = null } = {}) {
    const chave = `gc.visitaMapa.${cidade}.${usuario}`;
    const ls = armazenamento || (() => { try { return window.localStorage; } catch (e) { return null; } })();
    return {
      chave,
      ler() {
        try { const v = JSON.parse(ls.getItem(chave)); return v && v.t > 0 ? { t: Number(v.t), ind: v.ind || null } : null; } catch (e) { return null; }
      },
      gravar(t, ind) {
        try { ls.setItem(chave, JSON.stringify({ t, ind: ind || null })); } catch (e) { /* sem armazenamento */ }
      },
    };
  };

  // ---- cartão sobre o mapa (mesmo lugar e mesmo visual do Resumo do dia) ----
  // cb: aoAlternar(aberto), aoAbrir(id), aoIndicador(id), aoVerBairros(bairros), aoVisto().
  GC.criarDesdeVisita = function (el, cb, { botao = null, contador = null } = {}) {
    let recolhido = true;
    let ultimo = null;
    let ultimoHtml = '';

    const linha = (o, tom, extra, rotulo) => {
      const conteudo = `<span><b>${esc(o.titulo)}</b><small>${extra}</small></span>${rotulo ? `<em>${esc(rotulo)}</em>` : ''}`;
      return o.id
        ? `<li><button type="button" class="rs-item dv-item tom-${tom}" data-dv-abrir="${esc(o.id)}" title="Abrir no mapa">${conteudo}</button></li>`
        : `<li><div class="rs-item dv-item dv-sem-clique tom-${tom}">${conteudo}</div></li>`;
    };
    const bloco = (titulo, n, lista, html, acao = '') => (lista.length ? `<div class="rd-sub"><h3>${titulo}${n > lista.length ? ` <span class="dv-mais">${lista.length} de ${n}</span>` : ''}</h3>${acao}</div>
        <ul class="rs-lista">${lista.map(html).join('')}</ul>` : '');

    function corpo(r) {
      const c = r.contagem;
      const cab = `<header class="rd-cab"><h2>⏳ Desde a sua última visita <small>${esc(r.quando)}</small></h2>
          <button type="button" class="rd-x" data-dv="recolher" aria-label="Ocultar o que mudou" title="Ocultar o que mudou">−</button></header>${GC.grafismo ? GC.grafismo.regua(160, 6, 12) : ''}`;
      if (!r.total) {
        return `${cab}<p class="dv-vazio"><i class="ti ti-circle-check" aria-hidden="true"></i> Nada mudou no recorte desde a sua última visita.</p>`;
      }
      const num = (n, um, varios, tom) => `<div class="rs-num tom-${tom}"><b>${n}</b><small>${n === 1 ? um : varios}</small></div>`;
      const numeros = `<div class="rd-destaques rs-numeros dv-numeros">
          ${num(c.novas, 'ocorrência nova', 'ocorrências novas', c.criticas ? 'critico' : 'info')}
          ${num(c.resolvidas, 'resolvida', 'resolvidas', 'ok')}
          ${num(c.andaram, 'andou', 'andaram', 'info')}
          ${num(c.indicadores, 'indicador mudou', 'indicadores mudaram', c.pioraram ? 'critico' : 'ok')}
        </div>`;
      const tomSev = (s) => (s === 'critica' ? 'critico' : s === 'alta' ? 'atencao' : 'info');
      const novas = bloco('🔔 Novas', c.novas, r.novas,
        (o) => linha(o, tomSev(o.severidade), `${esc(SEV[o.severidade] || '')} · ${esc(o.bairro)}${o.resolvida ? ' · já resolvida' : ''}`),
        r.bairros.length ? '<button type="button" class="rd-link" data-dv="bairros">ver os bairros no mapa →</button>' : '');
      const andaram = bloco('🔄 Andaram', c.andaram, r.andaram, (o) => linha(o, 'info', esc(o.texto)));
      const resolvidas = bloco('✅ Resolvidas', c.resolvidas, r.resolvidas, (o) => linha(o, 'ok', `${esc(o.secretaria)} · ${esc(o.bairro)}`));
      const ind = r.indicadores.length ? `<div class="rd-sub"><h3>📊 Indicadores${c.indicadores > r.indicadores.length ? ` <span class="dv-mais">${r.indicadores.length} de ${c.indicadores}</span>` : ''}</h3></div>
        <ul class="rs-lista">${r.indicadores.map((i) => `<li><button type="button" class="rs-item dv-item tom-${i.melhorou ? 'ok' : 'critico'}" data-dv-ind="${esc(i.id)}" title="Abrir a ficha do indicador">
          <span><b>${esc(i.nome)}</b><small>${esc(SIT[i.de])} → ${esc(SIT[i.para])}</small></span><em>${i.melhorou ? 'melhorou' : 'piorou'}</em></button></li>`).join('')}</ul>` : '';
      return `${cab}${numeros}${novas}${andaram}${resolvidas}${ind}
        <button type="button" class="dv-visto" data-dv="visto"><i class="ti ti-checks" aria-hidden="true"></i> Marcar tudo como visto</button>`;
    }

    function ligar() {
      const em = (sel, fn) => el.querySelectorAll(sel).forEach((b) => { b.onclick = () => fn(b); });
      em('[data-dv="recolher"]', () => alternar(true));
      em('[data-dv="visto"]', () => cb.aoVisto && cb.aoVisto());
      em('[data-dv="bairros"]', () => cb.aoVerBairros && ultimo && cb.aoVerBairros(ultimo.bairros));
      em('[data-dv-abrir]', (b) => cb.aoAbrir && cb.aoAbrir(b.dataset.dvAbrir));
      em('[data-dv-ind]', (b) => cb.aoIndicador && cb.aoIndicador(b.dataset.dvInd));
    }

    function alternar(valor = !recolhido) {
      if (valor === recolhido) return;
      recolhido = valor;
      el.hidden = recolhido;
      if (botao) { botao.setAttribute('aria-expanded', String(!recolhido)); botao.classList.toggle('ativo', !recolhido); }
      if (cb.aoAlternar) cb.aoAlternar(!recolhido);
      if (!recolhido && ultimo) { ultimoHtml = ''; atualizar(ultimo); }
    }
    if (botao) botao.addEventListener('click', () => alternar());

    function atualizar(r) {
      ultimo = r;
      if (contador) { contador.hidden = !r.total; contador.textContent = r.total > 99 ? '99+' : String(r.total); }
      if (recolhido) return;
      const html = corpo(r);
      if (html === ultimoHtml) return;
      ultimoHtml = html;
      el.innerHTML = html;
      ligar();
    }

    return { atualizar, alternar, aberto: () => !recolhido };
  };
})(window.GC = window.GC || {});
