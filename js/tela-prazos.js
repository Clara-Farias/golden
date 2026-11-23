(function (GC) {
  // Tela "Parâmetros de prazo" (#/prazos). Registro em js/prazos-parametros.js; quem salva, audita e oferece o
  // "Desfazer" é o js/app/telas.js. Só o gestor geral muda; os outros veem os valores em texto.
  // O que depende da gravidade é uma tabela (linha = gravidade; colunas = pôr equipe em campo, resolver, folga sem
  // aprovação e responder cobrança), com a linha do tempo do ciclo embaixo de cada gravidade: os valores escritos nos
  // marcos e a marca do "vai estourar". O resto são linhas avulsas (texto à esquerda, campo à direita). Cada campo tem
  // a unidade ao lado, o equivalente e o "fábrica" numa linha de altura fixa (a tela não pula ao digitar) e o erro no
  // lugar dela. Com espaço, o efeito nas ocorrências de agora fica numa coluna ao lado; sem espaço, na barra presa
  // embaixo, que só aparece com mudança por salvar ou um aviso.
  const esc = (t) => GC.escaparHtml(t);
  const SEV = { critica: 'Crítica', alta: 'Alta', media: 'Média' };
  const SEVS = ['critica', 'alta', 'media'];
  const UNIDADES = [['min', 1, 'min'], ['h', 60, 'horas'], ['dias', 1440, 'dias']];
  const FATOR = Object.fromEntries(UNIDADES.map(([u, f]) => [u, f]));
  const ROTULO = {
    atendimento: 'Pôr equipe em campo',
    solucao: 'Resolver',
    prorrogacaoLivreMin: 'Folga sem aprovação',
    resposta: 'Responder cobrança',
    pausaTetoMin: 'Pausa volta ao prefeito depois de',
    ajudaMin: 'Responder pedido de ajuda de outra pasta',
    determinadaMin: 'Cumprir ajuda determinada pelo prefeito',
    antecipaMin: 'Avisar "vai estourar" com antecedência de',
  };
  // Colunas da tabela por gravidade: as três primeiras são o ciclo (a linha do tempo fica embaixo delas).
  const COLUNAS = [
    ['atendimento', 'desde que o alerta nasce'],
    ['solucao', 'desde que o alerta nasce'],
    ['prorrogacaoLivreMin', 'mais prazo que a pasta soma sozinha'],
    ['resposta', 'ou explicar o alerta'],
  ];
  const CAMPOS = Object.fromEntries(GC.CAMPOS_PRAZO.map(([k, s, , min, max]) => [s ? `${k}.${s}` : k, { k, s, min, max }]));
  const ler = (v, k, s) => (s ? v[k][s] : v[k]);
  const gravar = (v, k, s, x) => { if (s) v[k][s] = x; else v[k] = x; };
  const copia = (v) => JSON.parse(JSON.stringify(v));

  // Tempo exato em palavras: "1 dia e 12 h", "1 h 30 min". 0 tem texto próprio em cada campo.
  function duracao(min) {
    if (!Number.isFinite(min)) return '—';
    const m = Math.round(min);
    const d = Math.floor(m / 1440);
    const h = Math.floor((m % 1440) / 60);
    const r = m % 60;
    const partes = [];
    if (d) partes.push(`${d} ${d === 1 ? 'dia' : 'dias'}`);
    if (h) partes.push(`${h} h`);
    if (r) partes.push(`${r} min`);
    if (!partes.length) return '0 min';
    return partes.length > 1 && d ? `${partes[0]} e ${partes.slice(1).join(' ')}` : partes.join(' ');
  }
  const textoValor = (nome, min) => (min === 0 && nome.startsWith('prorrogacaoLivreMin') ? 'sempre vai ao prefeito' : duracao(min));
  // Unidade que mostra o número inteiro maior possível (3 dias, não 72 horas; 90 min, não 1,5 hora).
  const unidadeDe = (min) => (min >= 1440 && min % 1440 === 0 ? 'dias' : min >= 60 && min % 60 === 0 ? 'h' : 'min');
  const numero = (x) => String(Math.round(x * 100) / 100).replace('.', ',');
  const lerNumero = (t) => Number(String(t).trim().replace(',', '.'));
  const quando = (t) => new Date(t).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(',', ' às');
  const vezes = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
  // Distância mínima entre dois textos na mesma fileira da linha do tempo: 14% ou 84 px, o que for maior.
  const MARCA_MIN_PCT = 14;
  const MARCA_MIN_PX = 84;

  GC.criarTelaPrazos = function (el, { aoSalvar, aoRestaurar }) {
    let estado = null; // { valores, fabrica, podeMudar, sobre, ocorrencias }
    let rascunho = null; // valores sendo editados (null = igual ao salvo)
    let unidades = {}; // nome do campo → unidade escolhida
    let aviso = null; // { texto, erro }

    const valoresVistos = () => rascunho || estado.valores;

    // ---- Peças ----
    // opc.sev: nome da gravidade para o leitor de tela (na tabela, a gravidade é a linha);
    // opc.tabela: o rótulo só aparece quando a tabela vira cartões; opc.oculto: o texto da linha já é o rótulo.
    function campo(nome, rotulo, opc = {}) {
      const { k, s, min, max } = CAMPOS[nome];
      const v = valoresVistos();
      const x = ler(v, k, s);
      const id = `pzp-${nome.replace('.', '-')}`;
      const classeRotulo = `pzp-rotulo${opc.tabela ? ' pzp-rotulo-tab' : ''}${opc.oculto ? ' so-leitor' : ''}`;
      const sufixo = opc.sev ? `<span class="so-leitor"> · ${esc(opc.sev)}</span>` : '';
      if (!estado.podeMudar) {
        return `<div class="pzp-campo pzp-leitura"><span class="${classeRotulo}">${esc(rotulo)}${sufixo}</span><b>${esc(textoValor(nome, x))}</b></div>`;
      }
      const u = unidades[nome] || (unidades[nome] = Number.isFinite(x) ? unidadeDe(x) : 'min');
      const faixa = `De ${min === 0 ? '0' : duracao(min)} a ${duracao(max)}`;
      return `<div class="pzp-campo" data-campo="${nome}">
        <label class="${classeRotulo}" for="${id}">${esc(rotulo)}${sufixo}</label>
        <span class="pzp-entrada" title="${esc(faixa)}"><input id="${id}" name="${nome}" type="text" inputmode="decimal" autocomplete="off" value="${Number.isFinite(x) ? numero(x / FATOR[u]) : ''}"
          aria-describedby="${id}-dica ${id}-erro">
          <select name="${nome}" data-unidade aria-label="Unidade: ${esc(rotulo.toLowerCase())}${opc.sev ? ` (${esc(opc.sev)})` : ''}">${UNIDADES.map(([val, , txt]) => `<option value="${val}"${val === u ? ' selected' : ''}>${txt}</option>`).join('')}</select></span>
        <span class="pzp-sob">
          <span class="pzp-meta" id="${id}-dica"><span class="pzp-equivale" data-equivale></span><span data-fabrica></span></span>
          <span class="pzp-erro" id="${id}-erro" role="alert"></span>
        </span>
      </div>`;
    }

    // Linha do tempo do ciclo de uma gravidade, na escala dela (crítica em horas, média em dias): os valores ficam
    // escritos nos marcos e o "vai estourar" é uma marca antes do prazo de pôr equipe em campo. Texto que encostaria
    // em outro sobe para a fileira de cima; sem lugar, fica só no title.
    function trilha(s, v) {
      const at = v.atendimento[s];
      const so = v.solucao[s];
      const fo = v.prorrogacaoLivreMin[s];
      const av = v.antecipaMin;
      // O erro já aparece embaixo do campo: aqui só um aviso neutro no lugar da barra.
      if (![at, so, fo].every(Number.isFinite) || so < at) return '<p class="pzp-trilha-aviso">Confira os valores desta linha.</p>';
      const total = so + fo || 1;
      const pct = (x) => Math.max(0, Math.min(100, (x / total) * 100));
      const w = (x) => `${pct(x).toFixed(2)}%`;
      const temAviso = Number.isFinite(av) && av > 0;
      const posAviso = temAviso ? pct(Math.max(0, at - av)) : null;

      const marcas = [];
      if (temAviso) marcas.push({ pos: posAviso, html: 'vai estourar', classe: 'pzp-marca-aviso', fileira: 'acima' });
      marcas.push({ pos: pct(at), html: `<b>${esc(duracao(at))}</b>` });
      if (so > at) marcas.push({ pos: pct(so), html: `<b>${esc(duracao(so))}</b>` });
      if (fo) marcas.push({ pos: 100, html: `+${esc(duracao(fo))}` });
      const fileiras = { acima: [], abaixo: [] };
      const largura = (el.querySelector(`[data-trilha="${s}"] .pzp-faixa`) || {}).clientWidth || 600;
      const minimo = Math.max(MARCA_MIN_PCT, (MARCA_MIN_PX / largura) * 100);
      const cabe = (lista, pos) => lista.every((m) => Math.abs(m.pos - pos) >= minimo);
      marcas.forEach((m) => {
        const ordem = m.fileira ? [m.fileira] : ['abaixo', 'acima'];
        const onde = ordem.find((f) => cabe(fileiras[f], m.pos));
        if (onde) fileiras[onde].push(m);
      });
      const textos = (lista) => lista.map((m) => {
        const lado = m.pos < minimo / 2 ? ' ini' : m.pos > 100 - minimo / 2 ? ' fim' : '';
        return `<span class="pzp-marca${lado}${m.classe ? ` ${m.classe}` : ''}" style="left:${m.pos.toFixed(2)}%">${m.html}</span>`;
      }).join('');

      return `<div class="pzp-marcas acima">${textos(fileiras.acima)}</div>`
        + '<div class="pzp-faixa"><span class="pzp-segs">'
        + `<span class="pzp-seg pzp-seg-at" style="width:${w(at)}" title="Pôr equipe em campo: ${esc(duracao(at))}"></span>`
        + (so > at ? `<span class="pzp-seg pzp-seg-so" style="width:${w(so - at)}" title="Resolver: até ${esc(duracao(so))}"></span>` : '')
        + (fo ? `<span class="pzp-seg pzp-seg-fo" style="width:${w(fo)}" title="Folga sem aprovação: ${esc(duracao(fo))}"></span>` : '')
        + '</span>'
        + (temAviso ? `<span class="pzp-aviso" style="left:${posAviso.toFixed(2)}%" title="Vai estourar: ${esc(duracao(av))} antes do prazo de pôr equipe em campo"></span>` : '')
        + '</div>'
        + `<div class="pzp-marcas abaixo">${textos(fileiras.abaixo)}</div>`;
    }

    function tabela() {
      const v = valoresVistos();
      const cab = `<div class="pzp-tab-cab" aria-hidden="true"><span>Gravidade</span>${COLUNAS.map(([k, sub]) => `<span class="pzp-col-${k}"><b>${esc(ROTULO[k])}</b><small>${esc(sub)}</small></span>`).join('')}</div>`;
      const linhas = SEVS.map((s) => `<div class="pzp-tab-linha" data-sev="${s}" role="group" aria-label="Gravidade ${SEV[s].toLowerCase()}">
          <div class="pzp-tab-sev"><span class="pzp-selo ${s}">${SEV[s]}</span></div>
          ${COLUNAS.map(([k]) => `<div class="pzp-tab-cel pzp-col-${k}">${campo(`${k}.${s}`, ROTULO[k], { tabela: true, sev: SEV[s].toLowerCase() })}</div>`).join('')}
          <div class="pzp-trilha" data-trilha="${s}" aria-hidden="true">${trilha(s, v)}</div>
        </div>`).join('');
      return `<div class="pzp-tabela">${cab}${linhas}</div>`;
    }

    // Linha avulsa: o que o campo faz à esquerda, o campo à direita.
    const linha = (nome, texto) => `<div class="pzp-linha"><div class="pzp-linha-txt"><span class="pzp-linha-tit" aria-hidden="true">${esc(ROTULO[nome])}</span>
        <p class="pzp-texto">${texto}</p></div>${campo(nome, ROTULO[nome], { oculto: true })}</div>`;

    function desenhar() {
      const pode = estado.podeMudar;
      const sobre = estado.sobre;
      const mudouFabrica = GC.mudancasParametrosPrazo(estado.fabrica, estado.valores).length > 0;
      const auditoria = pode ? ' <a href="#/auditoria/periodo:30/tipo:configuracao">Ver na auditoria</a>' : '';
      const origem = sobre && sobre.editadaEm
        ? `Mudados${sobre.editadaPor ? ` por ${esc(sobre.editadaPor)}` : ''} em ${esc(quando(sobre.editadaEm))}.${auditoria}`
        : `Valem os valores de fábrica.${auditoria}`;
      el.innerHTML = `<div class="pzp${pode ? ' pzp-editavel' : ''}">
        <header class="sec-topo"><div><h2>⏱ Parâmetros de prazo</h2>
          <p>Quanto tempo cada etapa tem, quanta folga a pasta tem sem o prefeito e quanto tempo cada um tem para responder.</p>
          <p class="pzp-origem"><i class="ti ti-history" aria-hidden="true"></i> ${origem}</p></div>
          <span class="sec-acoes">
            ${pode ? `<button type="button" class="btn-sec" data-acao="fabrica"${mudouFabrica ? '' : ' hidden'}><i class="ti ti-restore" aria-hidden="true"></i> Voltar aos de fábrica</button>` : ''}
            <a class="btn-sec" href="#/regras"><i class="ti ti-bell-cog" aria-hidden="true"></i> Regras de alerta</a></span></header>
        ${pode ? '' : '<p class="pzp-so-ver"><i class="ti ti-lock" aria-hidden="true"></i> Só o gestor geral muda estes valores. Você vê o que vale hoje.</p>'}
        <div class="pzp-corpo">
        <form class="pzp-form" novalidate>
          <section class="rel-cartao pzp-bloco"><h3>Prazos por gravidade</h3>
            <p class="pzp-texto">Contados desde que o alerta nasce. Pedir mais prazo acima da folga, ou pela segunda vez, vai ao prefeito.</p>
            <p class="pzp-nota"><i class="ti ti-info-circle" aria-hidden="true"></i><span><b>Vale para os alertas novos.</b> Os abertos guardam os prazos com que nasceram, e uma regra de alerta pode ter prazos próprios.</span></p>
            <p class="pzp-legenda" aria-hidden="true"><span><i class="pzp-seg-at"></i> Pôr equipe em campo</span><span><i class="pzp-seg-so"></i> Resolver</span><span><i class="pzp-seg-fo"></i> Folga sem aprovação</span><span><i class="pzp-leg-aviso"></i> Vai estourar</span><span class="pzp-legenda-nota">Cada barra na escala da própria gravidade.</span></p>
            ${tabela()}
            ${linha('antecipaMin', 'Quanto antes do prazo de pôr equipe em campo o alerta entra em "vai estourar" na caixa do secretário e em "Precisam de você". É a marca escura nas barras.')}
          </section>
          <section class="rel-cartao pzp-bloco"><h3>Outros prazos</h3>
            ${linha('pausaTetoMin', 'A pasta pausa quando a espera não depende dela (concessionária, cidadão, clima, material). Pausada além disto, volta a "Precisam de você" e o prefeito pode cobrar.')}
            ${linha('ajudaMin', 'Quanto a secretaria tem para aceitar ou recusar um pedido de ajuda de outra pasta.')}
            ${linha('determinadaMin', 'Quanto a pasta tem para cumprir a ajuda que o prefeito determinou.')}
          </section>
          ${pode ? `<div class="pzp-barra" role="region" aria-label="Salvar parâmetros" hidden>
            <div class="pzp-barra-texto"><p class="pzp-msg" data-msg aria-live="polite"></p><div class="pzp-efeito" data-efeito="barra"></div></div>
            <span class="pzp-botoes">
              <button type="button" class="btn-sec" data-acao="descartar" hidden>Descartar</button>
              <button type="submit" class="btn-primario" data-acao="salvar" hidden><i class="ti ti-device-floppy" aria-hidden="true"></i> Salvar</button>
            </span></div>` : ''}
        </form>
        ${pode ? `<aside class="pzp-lado" aria-label="Efeito das mudanças"><section class="rel-cartao pzp-bloco pzp-efeito-cartao">
            <h3><i class="ti ti-chart-arrows" aria-hidden="true"></i> Efeito agora</h3><div class="pzp-efeito" data-efeito="lado" aria-live="polite"></div></section></aside>` : ''}
        </div></div>`;
      if (pode) { ligar(); vivo(); } else trilhas(estado.valores); // a segunda volta já mede a largura das barras
    }

    // ---- Leitura e conferência do formulário ----
    function lerForm() {
      const v = copia(estado.valores);
      el.querySelectorAll('.pzp-campo input[name]').forEach((i) => {
        const { k, s } = CAMPOS[i.name];
        const sel = el.querySelector(`select[name="${i.name}"]`);
        if (sel) unidades[i.name] = sel.value; // a unidade vale a que está escolhida na tela
        const u = unidades[i.name];
        const n = lerNumero(i.value);
        gravar(v, k, s, i.value.trim() === '' || !Number.isFinite(n) ? NaN : Math.round(n * FATOR[u]));
      });
      return v;
    }
    function erroDe(nome, v) {
      const { k, s, min, max } = CAMPOS[nome];
      const x = ler(v, k, s);
      if (!Number.isFinite(x)) return 'Digite um número.';
      if (x < min || x > max) return `Use de ${min === 0 ? '0' : duracao(min)} a ${duracao(max)}.`;
      if (k === 'solucao' && Number.isFinite(v.atendimento[s]) && x < v.atendimento[s]) return `Menor que pôr equipe em campo (${duracao(v.atendimento[s])}).`;
      return null;
    }
    const nomes = () => Object.keys(CAMPOS);
    const diferentes = (a, b) => nomes().filter((n) => { const { k, s } = CAMPOS[n]; return ler(a, k, s) !== ler(b, k, s); });

    // Atualiza o que depende dos valores sem redesenhar os campos (o foco e o cursor ficam onde estão).
    function vivo() {
      const v = lerForm();
      const salvos = estado.valores;
      const pendentes = diferentes(v, salvos);
      rascunho = pendentes.length ? v : null;
      let erros = 0;
      nomes().forEach((nome) => {
        const caixa = el.querySelector(`.pzp-campo[data-campo="${nome}"]`);
        if (!caixa) return;
        const { k, s } = CAMPOS[nome];
        const x = ler(v, k, s);
        const erro = erroDe(nome, v);
        if (erro) erros += 1;
        caixa.classList.toggle('com-erro', !!erro);
        caixa.querySelector('input').setAttribute('aria-invalid', erro ? 'true' : 'false');
        caixa.querySelector('.pzp-erro').textContent = erro || '';
        // O equivalente só aparece quando diz algo novo ("36 horas" → "1 dia e 12 h"; "2 horas" não repete "2 h").
        const u = unidades[nome];
        const n = Number.isFinite(x) ? x / FATOR[u] : NaN;
        const literal = Number.isInteger(n) ? `${n} ${u === 'min' ? 'min' : u === 'h' ? 'h' : n === 1 ? 'dia' : 'dias'}` : '';
        const equivale = Number.isFinite(x) ? textoValor(nome, x) : '—';
        caixa.querySelector('[data-equivale]').textContent = equivale === literal ? '' : x === 0 ? equivale : `= ${equivale}`;
        caixa.classList.toggle('pendente', pendentes.includes(nome));
        const fab = ler(estado.fabrica, k, s);
        const longe = Number.isFinite(x) && x !== fab;
        caixa.querySelector('[data-fabrica]').innerHTML = longe
          ? `<button type="button" class="pzp-volta" data-volta="${nome}" title="Voltar ao valor de fábrica: ${esc(textoValor(nome, fab))}"><i class="ti ti-arrow-back-up" aria-hidden="true"></i> fábrica: ${esc(textoValor(nome, fab))}</button>`
          : '';
        caixa.classList.toggle('alterado', longe);
      });
      trilhas(v);
      barra(pendentes.length, erros, v);
    }
    function trilhas(v) {
      SEVS.forEach((s) => {
        const t = el.querySelector(`[data-trilha="${s}"]`);
        if (t) t.innerHTML = trilha(s, v);
      });
    }

    function barra(nPendentes, erros, v) {
      const caixa = el.querySelector('.pzp-barra');
      if (!caixa) return;
      const msg = caixa.querySelector('[data-msg]');
      const salvar = caixa.querySelector('[data-acao="salvar"]');
      const descartar = caixa.querySelector('[data-acao="descartar"]');
      const fabrica = el.querySelector('[data-acao="fabrica"]');
      caixa.classList.toggle('pendente', nPendentes > 0);
      caixa.hidden = nPendentes === 0 && !aviso;
      salvar.hidden = descartar.hidden = nPendentes === 0;
      if (fabrica) fabrica.hidden = nPendentes > 0 || !GC.mudancasParametrosPrazo(estado.fabrica, estado.valores).length;
      salvar.disabled = erros > 0;
      msg.classList.toggle('erro', !!(aviso && aviso.erro) || erros > 0);
      if (aviso && aviso.erro) msg.textContent = aviso.texto;
      else if (nPendentes) msg.textContent = erros ? `${vezes(erros, 'campo precisa', 'campos precisam')} de correção antes de salvar.` : `${vezes(nPendentes, 'mudança', 'mudanças')} por salvar.`;
      else msg.textContent = aviso ? aviso.texto : '';
      const ef = efeito(v, nPendentes, erros);
      el.querySelectorAll('[data-efeito]').forEach((alvo) => { alvo.innerHTML = htmlEfeito(ef, alvo.dataset.efeito === 'lado'); });
    }

    // Efeito nas ocorrências de agora, só pelos prazos por gravidade (atendimento e solução).
    function efeito(v, nPendentes, erros) {
      const oc = estado.ocorrencias || [];
      const medir = GC.estimarParametrosPrazo && oc.length;
      if (!medir) return { tipo: 'sem_dados' };
      if (!nPendentes) return { tipo: 'parado', total: GC.estimarParametrosPrazo(oc, estado.valores, estado.valores).total };
      if (erros) return { tipo: 'erro' };
      const mexeu = SEVS.some((s) => v.atendimento[s] !== estado.valores.atendimento[s] || v.solucao[s] !== estado.valores.solucao[s]);
      if (!mexeu) return { tipo: 'sem_mexer' };
      const e = GC.estimarParametrosPrazo(oc, v, estado.valores);
      if (!e.total) return { tipo: 'sem_dados' };
      const itens = [
        ['Equipe fora do prazo', e.atendimento, false],
        ['Resolver fora do prazo', e.solucao, false],
        ...(e.noPrazoPct ? [['No prazo', e.noPrazoPct, true]] : []),
      ].filter(([, x]) => x.antes !== x.depois).map(([rotulo, x, pct]) => ({
        rotulo, antes: x.antes, depois: x.depois, pct,
        melhor: pct ? x.depois > x.antes : x.depois < x.antes,
      }));
      return { tipo: 'medido', total: e.total, itens };
    }
    function htmlEfeito(ef, lateral) {
      const p = (t) => `<p class="pzp-ef-base">${t}</p>`;
      if (ef.tipo === 'sem_dados') return lateral ? p('Sem ocorrências agora para medir o efeito.') : '';
      if (ef.tipo === 'parado') return lateral ? p(`Mude um prazo por gravidade para ver o que muda nas ${vezes(ef.total, 'ocorrência', 'ocorrências')} de agora.`) : '';
      if (ef.tipo === 'erro') return lateral ? p('Corrija os campos marcados para ver o efeito.') : '';
      if (ef.tipo === 'sem_mexer') return lateral ? p('Estas mudanças não mexem nos prazos por gravidade: nada muda nas ocorrências de agora.') : '';
      if (!ef.itens.length) return p(`Nenhuma das ${vezes(ef.total, 'ocorrência', 'ocorrências')} de agora muda de situação.`);
      const fmt = (x, pct) => (pct ? `${x}%` : x);
      return p(`Nas ${vezes(ef.total, 'ocorrência', 'ocorrências')} de agora:`)
        + `<ul class="pzp-ef-lista">${ef.itens.map((i) => `<li class="pzp-ef ${i.melhor ? 'melhor' : 'pior'}">
            <span>${esc(i.rotulo)}</span><b>${fmt(i.antes, i.pct)} → ${fmt(i.depois, i.pct)}</b>
            <i class="ti ti-${i.melhor ? 'arrow-down-right' : 'arrow-up-right'}" aria-hidden="true"></i><span class="so-leitor">${i.melhor ? 'melhora' : 'piora'}</span></li>`).join('')}</ul>`;
    }

    // ---- Eventos ----
    function ligar() {
      const raiz = el.querySelector('.pzp');
      const form = el.querySelector('.pzp-form');
      form.addEventListener('input', (e) => { if (e.target.matches('input[name]')) { aviso = null; vivo(); } });
      form.addEventListener('change', (e) => {
        const sel = e.target.closest('select[data-unidade]');
        if (!sel) return;
        // Trocar a unidade mantém o tempo: 72 horas viram 3 dias.
        const nome = sel.name;
        const input = form.querySelector(`input[name="${nome}"]`);
        const antes = lerNumero(input.value) * FATOR[unidades[nome]];
        unidades[nome] = sel.value;
        if (Number.isFinite(antes) && input.value.trim() !== '') input.value = numero(antes / FATOR[sel.value]);
        vivo();
      });
      raiz.addEventListener('click', (e) => {
        const volta = e.target.closest('[data-volta]');
        if (volta) {
          const nome = volta.dataset.volta;
          const { k, s } = CAMPOS[nome];
          const fab = ler(estado.fabrica, k, s);
          unidades[nome] = unidadeDe(fab);
          const input = form.querySelector(`input[name="${nome}"]`);
          input.value = numero(fab / FATOR[unidades[nome]]);
          form.querySelector(`select[name="${nome}"]`).value = unidades[nome];
          vivo();
          input.focus();
          return;
        }
        const acao = e.target.closest('[data-acao]');
        if (!acao) return;
        if (acao.dataset.acao === 'descartar') { rascunho = null; unidades = {}; aviso = { texto: 'Mudanças descartadas.' }; desenhar(); }
        if (acao.dataset.acao === 'fabrica') restaurar();
      });
      form.addEventListener('submit', (e) => { e.preventDefault(); salvar(); });
    }

    function salvar() {
      vivo();
      const primeiro = el.querySelector('.pzp-campo.com-erro input');
      if (primeiro) { primeiro.focus(); return; }
      if (!rascunho) return;
      const res = aoSalvar(rascunho) || { ok: false };
      if (!res.ok) {
        aviso = { erro: true, texto: res.motivo === 'permissao' ? 'O seu perfil não pode mudar os parâmetros de prazo.' : 'Não deu para salvar. Confira os valores.' };
        barra(1, 0, rascunho);
        return;
      }
      estado = Object.assign({}, estado, { valores: res.valores });
      rascunho = null;
      aviso = { texto: res.semMudanca ? 'Nada mudou.' : `Salvo: ${vezes(res.mudancas.length, 'mudança', 'mudanças')}. Valem para os alertas novos.` };
      desenhar();
    }

    async function restaurar() {
      const lista = GC.mudancasParametrosPrazo(estado.valores, estado.fabrica);
      const sim = GC.confirmar
        ? await GC.confirmar({ titulo: 'Voltar aos valores de fábrica?', texto: `${vezes(lista.length, 'valor volta', 'valores voltam')} ao padrão: ${lista.join('; ')}.`, sim: 'Voltar aos de fábrica', perigo: true })
        : window.confirm('Voltar aos valores de fábrica?');
      if (!sim) return;
      const res = aoRestaurar() || { ok: false };
      aviso = res.ok ? { texto: 'Os parâmetros voltaram aos valores de fábrica.' } : { erro: true, texto: 'Não deu para voltar aos valores de fábrica.' };
      if (res.ok) { estado = Object.assign({}, estado, { valores: res.valores }); rascunho = null; unidades = {}; }
      desenhar();
    }

    return {
      // estado: { valores, fabrica, podeMudar, sobre, ocorrencias? }
      mostrar(novo) { estado = novo; rascunho = null; unidades = {}; aviso = null; desenhar(); },
      // Outra aba salvou ou o "Desfazer" voltou: o que está sendo editado continua na tela.
      atualizar(novo) {
        const editando = rascunho;
        estado = novo;
        rascunho = editando && diferentes(editando, novo.valores).length ? editando : null;
        if (!rascunho) unidades = {};
        aviso = null; // o aviso de antes ("Salvo…") já não vale
        desenhar();
      },
    };
  };

  GC.duracaoPrazoTexto = duracao;
})(window.GC = window.GC || {});
