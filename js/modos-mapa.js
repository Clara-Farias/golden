(function (GC) {
  // Dois modos do mapa que não mexem nos filtros nem nos dados: a linha do tempo (qualquer dia do último
  // ano) e o modo telão. Cada um devolve um controle pequeno; o app liga os botões e decide o que desenhar.

  const semMovimento = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  // Esconde com a animação de saída do CSS (classe "saindo", que termina num @keyframes); com movimento
  // reduzido, na hora. A entrada é só CSS: o @keyframes roda quando o elemento deixa de ser display: none.
  // GC.mostrarAnimado cancela uma saída em andamento (abrir de novo no meio dela).
  GC.esconderAnimado = function (alvo, depois) {
    if (!alvo || alvo.hidden || alvo.classList.contains('saindo')) return;
    if (semMovimento()) { alvo.hidden = true; if (depois) depois(); return; }
    let feito = false;
    const fim = () => {
      if (feito) return;
      feito = true;
      limpar();
      alvo.hidden = true;
      if (depois) depois();
    };
    const aoFim = (ev) => { if (ev.target === alvo) fim(); };
    const limpar = () => { clearTimeout(t); alvo.removeEventListener('animationend', aoFim); alvo.classList.remove('saindo'); alvo._cancelarSaida = null; };
    alvo.classList.add('saindo');
    alvo.addEventListener('animationend', aoFim);
    const t = setTimeout(fim, 450); // se o navegador não disparar o animationend
    alvo._cancelarSaida = () => { feito = true; limpar(); };
  };
  GC.mostrarAnimado = function (alvo) {
    if (alvo._cancelarSaida) alvo._cancelarSaida();
    alvo.hidden = false;
  };
  // Aberto de verdade (não conta o que está saindo).
  const visivel = (alvo) => !!alvo && !alvo.hidden && !alvo.classList.contains('saindo');
  // Reinicia uma animação de CSS ligada a uma classe (o mesmo valor mudou de novo).
  GC.repetirAnimacao = function (alvo, classe) {
    if (!alvo || semMovimento()) return;
    alvo.classList.remove(classe);
    void alvo.offsetWidth; // força o recálculo: sem ele a classe volta sem reiniciar a animação
    alvo.classList.add(classe);
  };

  // ======================= Linha do tempo =======================
  // Barra flutuante na base do mapa: ▶/❚❚, o dia (botão que abre um calendário, até um ano atrás), a régua
  // do dia com as horas (00h → 24h, com um balão na hora escolhida), o instante e "Ao vivo".
  // aoMudar(t) recebe o instante escolhido (null = ao vivo). Tocar um dia leva ~24 s (1 h por segundo).
  // Além dos alertas: indicadores(t) devolve os chips da faixa de baixo (leitos, B.O.s, obras no instante;
  // aoCamada(nome) liga ou desliga a camada do chip; c.ligada diz o estado) e comparar(pa, pb) monta a comparação de dois períodos do painel
  // "Comparar" (aoPintar(niveis | null) pinta no mapa os bairros onde os alertas subiram). Com aoLadoALado,
  // o painel ganha "Dois mapas" (o padrão): aoLadoALado({ r, rotulos: { a, b } } | null) mostra ou esconde os
  // dois mapas, um por período (js/mapa-comparar.js); "Tabela" volta à tabela e ao mapa pintado, com o painel
  // numa coluna à direita (aoLateral(true | false) avisa para o mapa reenquadrar no espaço que sobra).
  // aoApontarBairro(id | null): o bairro sob o mouse nas listas do Comparar, para o mapa levantá-lo.
  // aoAbrirFechar(aberta): a barra abriu ou fechou (o mapa reenquadra acima dela).
  GC.criarLinhaTempoUI = function (palco, { agora, aoMudar, indicadores = null, aoCamada = null, comparar = null, aoPintar = null, aoLadoALado = null, aoLateral = null, aoApontarBairro = null, aoAbrirFechar = null, limiteDias = GC.LIMITE_DIAS_LINHA_TEMPO }) {
    const DIA = 24 * 3600000;
    const PASSO = 5 * 60000; // de 5 em 5 minutos
    const PASSOS = DIA / PASSO; // 288
    const HORAS = [0, 3, 6, 9, 12, 15, 18, 21, 24];
    const el = document.createElement('div');
    el.className = 'linha-tempo vidro';
    el.setAttribute('role', 'group');
    el.setAttribute('aria-label', 'Linha do tempo');
    el.hidden = true;
    el.innerHTML = `
      <button type="button" class="lt-tocar" aria-label="Tocar o dia" title="Tocar o dia (1 h por segundo)"><i class="ti ti-player-play" aria-hidden="true"></i></button>
      <div class="lt-dia-rot">
        <button type="button" class="lt-dia" aria-haspopup="dialog" aria-expanded="false">
          <i class="ti ti-calendar" aria-hidden="true"></i><span class="lt-dia-txt"></span><i class="ti ti-chevron-down lt-dia-seta" aria-hidden="true"></i>
        </button>
        <div class="lt-cal" role="dialog" aria-label="Escolher o dia" hidden>
          <div class="lt-cal-topo">
            <button type="button" class="lt-cal-nav" data-mes="-1" aria-label="Mês anterior"><i class="ti ti-chevron-left" aria-hidden="true"></i></button>
            <b class="lt-cal-mes" aria-live="polite"></b>
            <button type="button" class="lt-cal-nav" data-mes="1" aria-label="Próximo mês"><i class="ti ti-chevron-right" aria-hidden="true"></i></button>
          </div>
          <div class="lt-cal-grade" role="grid"></div>
          <div class="lt-cal-atalhos">
            <button type="button" data-atalho="hoje">Hoje</button>
            <button type="button" data-atalho="ontem">Ontem</button>
            <button type="button" data-atalho="semana">−1 semana</button>
            <button type="button" data-atalho="mes">−1 mês</button>
          </div>
        </div>
      </div>
      <div class="lt-regua">
        <div class="lt-trilho">
          <span class="lt-balao" aria-hidden="true"></span>
          <input type="range" min="0" max="${PASSOS}" step="1" value="${PASSOS}" aria-label="Hora">
        </div>
        <div class="lt-marcas" aria-hidden="true">${HORAS.map((h) => `<span>${String(h).padStart(2, '0')}h</span>`).join('')}</div>
      </div>
      <div class="lt-info"><b class="lt-quando">agora</b><small class="lt-quantas"></small></div>
      ${comparar ? `<button type="button" class="lt-comparar" aria-haspopup="dialog" aria-expanded="false" title="Comparar dois períodos">
        <i class="ti ti-arrows-diff" aria-hidden="true"></i><span class="lt-comparar-txt">Comparar</span></button>` : ''}
      <button type="button" class="lt-ao-vivo" title="Voltar ao vivo" aria-label="Voltar ao vivo"><span class="ponto" aria-hidden="true"></span><span class="lt-ao-vivo-txt">Ao vivo</span></button>
      <button type="button" class="lt-fechar gaveta-x" aria-label="Fechar a linha do tempo"><i class="ti ti-x" aria-hidden="true"></i></button>
      ${indicadores ? '<div class="lt-chips" role="group" aria-label="Outros indicadores no instante"></div>' : ''}
      ${comparar ? `<div class="lt-comp" role="dialog" aria-label="Comparar dois períodos" hidden>
        <div class="lt-comp-topo">
          <b>Comparar períodos</b>
          <div class="lt-comp-resumo" role="group" aria-label="Períodos comparados">
            <button type="button" data-resumo="a" tabindex="-1"><span class="lt-comp-cor a" aria-hidden="true"></span><span class="lt-comp-resumo-a"></span><i class="ti ti-calendar-event" aria-hidden="true"></i></button>
            <span class="lt-comp-resumo-x" aria-hidden="true">×</span>
            <button type="button" data-resumo="b" tabindex="-1"><span class="lt-comp-cor b" aria-hidden="true"></span><span class="lt-comp-resumo-b"></span><i class="ti ti-calendar-event" aria-hidden="true"></i></button>
          </div>
          ${aoLadoALado ? `<div class="lt-comp-vista" role="group" aria-label="Como ver">
            <button type="button" data-vista="lado" aria-pressed="true" title="Um mapa para cada período, lado a lado"><i class="ti ti-layout-columns" aria-hidden="true"></i>Dois mapas</button>
            <button type="button" data-vista="um" aria-pressed="false" title="Os números dos dois períodos em tabela; o mapa pinta os bairros onde os alertas subiram"><i class="ti ti-table" aria-hidden="true"></i>Tabela</button>
          </div>` : ''}
          <button type="button" class="lt-comp-recolher gaveta-x" aria-expanded="true" aria-label="Recolher a escolha dos períodos" title="Recolher"><i class="ti ti-chevron-down" aria-hidden="true"></i></button>
          <button type="button" class="lt-comp-x gaveta-x" aria-label="Fechar a comparação"><i class="ti ti-x" aria-hidden="true"></i></button>
        </div>
        <div class="lt-comp-ajustes"><div class="lt-comp-ajustes-in">
          <div class="lt-comp-periodos">
            <button type="button" class="lt-comp-p a" data-editar="a" aria-expanded="false">
              <span class="lt-comp-p-rot"><span class="lt-comp-cor a" aria-hidden="true"></span>Período<i class="ti ti-calendar-event lt-comp-p-ic" aria-hidden="true"></i></span>
              <b class="lt-comp-faixa"></b>
              <small class="lt-comp-detalhe"></small>
            </button>
            <button type="button" class="lt-comp-trocar" aria-label="Inverter: o período vira a comparação e a comparação vira o período" title="Inverter: o período vira a comparação e a comparação vira o período"><i class="ti ti-arrows-left-right" aria-hidden="true"></i><span aria-hidden="true">inverter</span></button>
            <button type="button" class="lt-comp-p b" data-editar="b" aria-expanded="false">
              <span class="lt-comp-p-rot"><span class="lt-comp-cor b" aria-hidden="true"></span>Comparar com<i class="ti ti-calendar-event lt-comp-p-ic" aria-hidden="true"></i></span>
              <b class="lt-comp-faixa"></b>
              <small class="lt-comp-detalhe"></small>
            </button>
          </div>
          <div class="lt-int" role="group" aria-label="Escolher as datas" hidden>
            <div class="lt-int-topo"><b class="lt-int-tit"></b><span class="lt-int-ajuda"></span></div>
            <div class="lt-int-corpo">
              <div class="lt-int-atalhos" role="group" aria-label="Atalhos"></div>
              <div class="lt-int-cal">
                <button type="button" class="lt-int-nav ant" data-mes="-1" aria-label="Mês anterior"><i class="ti ti-chevron-left" aria-hidden="true"></i></button>
                <div class="lt-int-meses"></div>
                <button type="button" class="lt-int-nav prox" data-mes="1" aria-label="Próximo mês"><i class="ti ti-chevron-right" aria-hidden="true"></i></button>
              </div>
            </div>
            <div class="lt-int-pe">
              <span class="lt-int-escolha" aria-live="polite"></span>
              <button type="button" class="lt-int-cancelar">Cancelar</button>
              <button type="button" class="lt-int-aplicar">Aplicar</button>
            </div>
          </div>
        </div></div>
        <div class="lt-comp-corpo" aria-live="polite"></div>
      </div>` : ''}`;
    palco.appendChild(el);
    // O painel "Comparar" mora no palco, não na barra: a barra tem transform (o painel não escaparia dela) e, no
    // modo Tabela, ele vira uma coluna alta à direita do mapa. Sobre a barra, ele se apoia na altura dela (--lt-alt).
    const comp = el.querySelector('.lt-comp');
    if (comp) palco.appendChild(comp);
    if (typeof ResizeObserver === 'function') new ResizeObserver(() => palco.style.setProperty('--lt-alt', `${el.offsetHeight}px`)).observe(el);
    const faixa = el.querySelector('input');
    const btnDia = el.querySelector('.lt-dia');
    const cal = el.querySelector('.lt-cal');
    const calGrade = el.querySelector('.lt-cal-grade');
    const balao = el.querySelector('.lt-balao');
    const btnTocar = el.querySelector('.lt-tocar');
    let tocando = null;
    let instante = null;
    let inicioDia = GC.inicioDoDia(agora());
    let diaRotulado = null; // o "hoje" com que o rótulo do dia foi escrito (Hoje/Ontem mudam à meia-noite)
    let mesVisto = null; // { ano, mes } do calendário aberto

    const ehHoje = () => inicioDia === GC.inicioDoDia(agora());
    // Até onde a régua anda: hoje, só até agora; um dia passado, o dia inteiro.
    const passoLimite = () => (ehHoje() ? Math.min(PASSOS, Math.floor((agora() - inicioDia) / PASSO)) : PASSOS);
    // Instante do passo (o fim de um dia passado é 23:59, não a meia-noite do dia seguinte).
    const tDe = (passo) => inicioDia + passo * PASSO - (passo >= PASSOS ? 60000 : 0);

    function rotularDia() {
      diaRotulado = GC.inicioDoDia(agora());
      const rotulo = GC.rotuloDia(inicioDia, agora());
      el.querySelector('.lt-dia-txt').textContent = rotulo;
      btnDia.setAttribute('aria-label', `Dia: ${GC.rotuloDiaLongo(inicioDia)}. Escolher outro dia`);
      btnDia.title = 'Escolher o dia (até um ano atrás)';
    }

    // ---- Calendário ----
    // Grade do mês com foco "itinerante" (um só dia com tabindex 0): setas andam um dia ou uma semana,
    // PageUp/PageDown um mês, Home/End o começo e o fim da semana, Enter/Espaço escolhe, Esc fecha.
    const calAberto = () => visivel(cal);
    const dentroDoLimite = (d) => { const { min, max } = GC.limitesLinhaTempo(agora(), limiteDias); return Math.min(max, Math.max(min, d)); };
    function desenharCalendario(foco) {
      const { min, max } = GC.limitesLinhaTempo(agora(), limiteDias);
      const { ano, mes } = mesVisto;
      const hoje = GC.inicioDoDia(agora());
      el.querySelector('.lt-cal-mes').textContent = GC.rotuloMes(ano, mes);
      const [ant, prox] = el.querySelectorAll('.lt-cal-nav');
      ant.disabled = new Date(ano, mes, 1).getTime() <= min;
      prox.disabled = new Date(ano, mes + 1, 0).getTime() >= max;
      const cab = `<div role="row" class="lt-cal-sem">${GC.DIAS_SEMANA.map((s) => `<span role="columnheader" aria-label="${s}">${s[0].toUpperCase()}</span>`).join('')}</div>`;
      calGrade.innerHTML = cab + GC.gradeMes(ano, mes).map((semana) => `<div role="row">${semana.map((d) => {
        if (d === null) return '<span role="gridcell"></span>';
        const fora = d < min || d > max;
        const classes = ['lt-cal-d', d === hoje ? 'hoje' : '', d === inicioDia ? 'escolhido' : ''].filter(Boolean).join(' ');
        return `<span role="gridcell" aria-selected="${d === inicioDia}"><button type="button" class="${classes}" data-dia="${d}"`
          + ` tabindex="${d === foco ? 0 : -1}"${fora ? ' disabled' : ''} aria-label="${GC.rotuloDiaLongo(d)}${d === hoje ? ' (hoje)' : ''}"`
          + `${d === inicioDia ? ' aria-current="date"' : ''}>${new Date(d).getDate()}</button></span>`;
      }).join('')}</div>`).join('');
    }
    // Põe o foco num dia (trocando de mês se preciso).
    function focarDia(d) {
      const alvo = dentroDoLimite(d);
      const dt = new Date(alvo);
      if (!mesVisto || mesVisto.ano !== dt.getFullYear() || mesVisto.mes !== dt.getMonth()) mesVisto = { ano: dt.getFullYear(), mes: dt.getMonth() };
      desenharCalendario(alvo);
      const b = calGrade.querySelector(`[data-dia="${alvo}"]`);
      if (b) b.focus();
    }
    function abrirCalendario() {
      fecharComparacao(false);
      GC.mostrarAnimado(cal);
      btnDia.setAttribute('aria-expanded', 'true');
      el.classList.add('com-calendario');
      mesVisto = null;
      focarDia(inicioDia);
      document.addEventListener('pointerdown', foraDoCalendario, true);
    }
    // Devolve true se estava aberto (o Esc do app fecha primeiro o calendário, depois a barra).
    function fecharCalendario(devolverFoco = true) {
      if (!calAberto()) return false;
      GC.esconderAnimado(cal);
      btnDia.setAttribute('aria-expanded', 'false');
      el.classList.remove('com-calendario');
      document.removeEventListener('pointerdown', foraDoCalendario, true);
      if (devolverFoco) btnDia.focus();
      return true;
    }
    function foraDoCalendario(ev) {
      if (!el.querySelector('.lt-dia-rot').contains(ev.target)) fecharCalendario(false);
    }
    function escolherDia(d) {
      fecharCalendario();
      trocarDia(dentroDoLimite(d));
    }
    btnDia.addEventListener('click', () => (calAberto() ? fecharCalendario() : abrirCalendario()));
    el.querySelectorAll('.lt-cal-nav').forEach((b) => b.addEventListener('click', () => {
      const { ano, mes } = mesVisto;
      const novo = new Date(ano, mes + Number(b.dataset.mes), 1);
      mesVisto = { ano: novo.getFullYear(), mes: novo.getMonth() };
      // O foco fica no mesmo dia do mês novo (ou no limite), sem tirar o foco do botão de navegação.
      const ultimo = new Date(mesVisto.ano, mesVisto.mes + 1, 0).getDate();
      const dia = Math.min(new Date(inicioDia).getDate(), ultimo);
      desenharCalendario(dentroDoLimite(new Date(mesVisto.ano, mesVisto.mes, dia).getTime()));
    }));
    calGrade.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-dia]');
      if (b && !b.disabled) escolherDia(Number(b.dataset.dia));
    });
    calGrade.addEventListener('keydown', (ev) => {
      const b = ev.target.closest('[data-dia]');
      if (!b) return;
      const d = new Date(Number(b.dataset.dia));
      const mais = (n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n).getTime();
      const passos = {
        ArrowLeft: () => mais(-1), ArrowRight: () => mais(1), ArrowUp: () => mais(-7), ArrowDown: () => mais(7),
        Home: () => mais(-d.getDay()), End: () => mais(6 - d.getDay()),
        PageUp: () => GC.mesesAntes(d.getTime(), ev.shiftKey ? 12 : 1), PageDown: () => GC.mesesAntes(d.getTime(), ev.shiftKey ? -12 : -1),
      };
      if (passos[ev.key]) { ev.preventDefault(); focarDia(passos[ev.key]()); }
    });
    el.querySelector('.lt-cal-atalhos').addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-atalho]');
      if (!b) return;
      const hoje = GC.inicioDoDia(agora());
      const h = new Date(hoje);
      const dias = (n) => new Date(h.getFullYear(), h.getMonth(), h.getDate() - n).getTime();
      escolherDia({ hoje, ontem: dias(1), semana: dias(7), mes: GC.mesesAntes(hoje, 1) }[b.dataset.atalho]);
    });

    // Ao vivo, a régua acompanha o relógio (o app chama marcar a cada render): o polegar anda junto com o
    // fim do trecho riscado e, passada a meia-noite, a régua passa para o dia novo. Virou o dia num dia
    // passado: só o rótulo (Hoje/Ontem) muda.
    function acompanharRelogio() {
      const hoje = GC.inicioDoDia(agora());
      const virouDia = instante === null && inicioDia !== hoje;
      if (instante === null) {
        inicioDia = hoje;
        faixa.value = passoLimite();
      }
      if (virouDia || diaRotulado !== hoje) rotularDia();
    }
    function marcar(quantas) {
      acompanharRelogio();
      const hora = instante === null ? 'agora' : GC.rotuloHora(instante);
      el.querySelector('.lt-quando').textContent = hora;
      el.querySelector('.lt-quantas').textContent = quantas === undefined ? '' : `${quantas} ${quantas === 1 ? 'aberta' : 'abertas'}`;
      el.classList.toggle('no-agora', instante === null); // não usar "ao-vivo": já é a bolinha verde do cabeçalho (styles.css)
      const p = (Number(faixa.value) / PASSOS) * 100;
      faixa.style.setProperty('--p', `${p}%`);
      el.style.setProperty('--p', `${p}%`);
      // Hoje: o trecho depois de agora fica apagado (ainda não aconteceu).
      el.style.setProperty('--limite', `${(passoLimite() / PASSOS) * 100}%`);
      el.classList.toggle('dia-passado', !ehHoje());
      balao.textContent = instante === null ? GC.rotuloHora(agora()) : GC.rotuloHora(instante);
      faixa.setAttribute('aria-valuetext', `${GC.rotuloDia(inicioDia, agora())}, ${hora}`);
      marcarChips();
    }
    function irPara(passo) {
      const p = Math.max(0, Math.min(Number(passo), passoLimite()));
      faixa.value = p;
      instante = ehHoje() && p >= passoLimite() ? null : tDe(p);
      marcar(); // antes do aoMudar: o app chama marcar(quantas) com a contagem do instante
      aoMudar(instante);
    }
    // Pulo da régua (outro dia, "Ao vivo"): o polegar desliza até o passo em ~0,4 s e só então o mapa muda
    // (um redesenho só, no fim). Arrastar ou tocar no meio cancela o deslize.
    let deslize = null;
    function pararDeslize() { if (deslize) { cancelAnimationFrame(deslize); deslize = null; } }
    function deslizarPara(passo) {
      pararDeslize();
      const alvo = Math.max(0, Math.min(Number(passo), passoLimite()));
      const de = Number(faixa.value);
      if (semMovimento() || !visivel(el) || Math.abs(alvo - de) < 3) return irPara(alvo);
      const t0 = performance.now();
      const DUR = 420;
      const quadro = (t) => {
        const k = Math.min(1, (t - t0) / DUR);
        const v = de + (alvo - de) * (1 - Math.pow(1 - k, 3)); // desacelera no fim
        faixa.value = Math.round(v);
        const p = `${(v / PASSOS) * 100}%`;
        faixa.style.setProperty('--p', p);
        el.style.setProperty('--p', p);
        balao.textContent = GC.rotuloHora(tDe(Math.round(v)));
        if (k < 1) { deslize = requestAnimationFrame(quadro); return; }
        deslize = null;
        irPara(alvo);
      };
      deslize = requestAnimationFrame(quadro);
    }
    function trocarDia(inicio) {
      parar();
      inicioDia = inicio;
      rotularDia();
      GC.repetirAnimacao(btnDia, 'trocou');
      // Hoje: volta ao vivo. Outro dia: começa ao meio-dia (arraste ou ▶ para percorrer as horas).
      deslizarPara(ehHoje() ? PASSOS : PASSOS / 2);
      desenharComparacao();
    }
    function parar() {
      clearInterval(tocando);
      tocando = null;
      btnTocar.innerHTML = '<i class="ti ti-player-play" aria-hidden="true"></i>';
      btnTocar.setAttribute('aria-label', 'Tocar o dia');
    }
    function tocar() {
      if (tocando) return parar();
      pararDeslize();
      if (Number(faixa.value) >= passoLimite()) irPara(0);
      btnTocar.innerHTML = '<i class="ti ti-player-pause" aria-hidden="true"></i>';
      btnTocar.setAttribute('aria-label', 'Pausar');
      tocando = setInterval(() => {
        const p = Number(faixa.value) + 1;
        irPara(p);
        if (p >= passoLimite()) parar();
      }, 1000 / 12); // 12 passos de 5 min por segundo = 1 h/s
    }
    faixa.addEventListener('input', () => { parar(); pararDeslize(); irPara(faixa.value); });
    btnTocar.onclick = tocar;
    el.querySelector('.lt-ao-vivo').onclick = () => trocarDia(GC.inicioDoDia(agora()));
    el.querySelector('.lt-fechar').onclick = () => fechar();

    // ---- Chips: outros indicadores no instante (leitos, B.O.s, obras) ----
    const chips = el.querySelector('.lt-chips');
    let chipsChave = '';
    // Cada chip é um interruptor da camada dele (c.ligada vem do painel Camadas): ligado, fica cheio, com ✕ para
    // tirar do mapa; desligado, o ícone de mapa diz que o clique mostra no mapa.
    function marcarChips() {
      if (!chips) return;
      const lista = indicadores(instante) || [];
      const html = lista.map((c) => {
        const acao = c.camada ? (c.ligada ? 'No mapa. Clique para tirar' : 'Clique para ver no mapa') : '';
        const titulo = [c.titulo, acao].filter(Boolean).join('. ');
        return `<button type="button" class="lt-chip${c.tom ? ` ${c.tom}` : ''}${c.ligada ? ' ligada' : ''}" data-camada="${c.camada || ''}"`
          + `${c.camada ? ` aria-pressed="${!!c.ligada}"` : ''} title="${GC.escaparHtml(titulo)}">`
          + `<i class="ti ${c.icone}" aria-hidden="true"></i><span>${c.html}</span>`
          + `${c.camada ? `<i class="ti ${c.ligada ? 'ti-x' : 'ti-map-2'} lt-chip-acao" aria-hidden="true"></i>` : ''}</button>`;
      }).join('');
      if (html !== chipsChave) { chipsChave = html; chips.innerHTML = html; } // sem refazer o DOM a cada passo igual
    }
    if (chips) chips.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-camada]');
      if (!b || !b.dataset.camada || !aoCamada) return;
      aoCamada(b.dataset.camada);
      marcarChips();
      const novo = chips.querySelector(`[data-camada="${b.dataset.camada}"]`);
      if (novo && document.activeElement !== novo) novo.focus(); // o DOM foi refeito: o foco fica no chip
    });

    // ---- Comparar dois períodos ----
    // Dois cartões, um por período, com a mesma cor dos mapas lado a lado (A = cor principal, B = cinza).
    // Clicar num cartão abre, dentro do painel, o calendário de intervalo:
    // - Período: atalhos (Hoje, Últimos 7 dias, Mês passado…) ou dois cliques no calendário (primeiro e
    //   último dia, de 1 a GC.MAX_DIAS_COMPARAR dias). O último dia é o dia da régua (mudar aqui muda a
    //   linha do tempo, e vice-versa).
    // - Comparar com: atalhos (GC.referenciasComparar, só os que dão um período diferente) ou um clique no
    //   primeiro dia; o tamanho é sempre o do Período, para a comparação ser justa.
    const btnComp = el.querySelector('.lt-comparar');
    const compAberto = () => visivel(comp);
    const estadoComp = { diasA: 7, modo: 'anterior', bInicio: null, lado: !!aoLadoALado, recolhido: false, soMudou: false };
    const maisDias = (t, n) => { const d = new Date(t); return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n).getTime(); };
    const curto = (t) => new Date(t).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    const fmt = (v, unidade) => `${typeof v === 'number' && !Number.isInteger(v) ? v.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) : v}${unidade}`;
    // Os dois períodos de agora, sempre dentro do último ano e do mesmo tamanho.
    function periodosAtuais() {
      const { min, max } = GC.limitesLinhaTempo(agora(), limiteDias);
      const n = estadoComp.diasA;
      const pa = GC.encaixarPeriodo(GC.periodoDeDias(n, inicioDia, agora()), min, max, agora());
      estadoComp.modo = GC.referenciaValida(n, estadoComp.modo);
      const pb0 = estadoComp.modo === 'livre' && estadoComp.bInicio !== null
        ? GC.periodoEntre(estadoComp.bInicio, maisDias(estadoComp.bInicio, n - 1), agora())
        : GC.periodoReferencia(pa, estadoComp.modo, agora());
      return { pa, pb: GC.encaixarPeriodo(pb0, min, max, agora()), min, max };
    }
    let chaveComp = ''; // períodos e vista desenhados: muda → as linhas entram de novo, animadas
    // Bairro das listas levantado no mapa agora (aoApontarBairro(id | null)); a lista marca o item apontado.
    let apontado = null;
    function apontar(id) {
      if (id === apontado) return;
      apontado = id;
      if (aoApontarBairro) aoApontarBairro(id);
      comp.querySelectorAll('[data-bairro]').forEach((b) => b.classList.toggle('apontado', b.dataset.bairro === id));
    }
    let corpoHtml = '';
    // Tabela: o painel vira uma coluna alta à direita (css: .lt-comp.lateral, só em tela larga), a barra e os
    // controles do mapa abrem espaço (body.com-comp-lateral) e o mapa pintado reenquadra no que sobra (aoLateral).
    const telaLarga = () => !window.matchMedia || window.matchMedia('(min-width: 721px)').matches; // celular: fica sobre a barra
    function marcarLateral(quer) {
      const sim = !!quer && telaLarga();
      if (comp.classList.contains('lateral') === sim) return;
      comp.classList.toggle('lateral', sim);
      document.body.classList.toggle('com-comp-lateral', sim);
      if (aoLateral) aoLateral(sim);
    }
    function desenharComparacao() {
      if (!compAberto()) return;
      const { pa, pb } = periodosAtuais();
      const rot = { a: GC.rotuloPeriodo(pa, agora()), b: GC.rotuloPeriodo(pb, agora()) };
      [['a', pa], ['b', pb]].forEach(([k, p]) => {
        const faixaEl = comp.querySelector(`.lt-comp-p.${k} .lt-comp-faixa`);
        if (faixaEl.textContent !== rot[k]) {
          const antes = faixaEl.textContent;
          faixaEl.textContent = rot[k];
          if (antes) GC.repetirAnimacao(faixaEl, 'mudou');
        }
        const detalhe = GC.detalhePeriodo(p, agora(), k === 'b' ? pa : null);
        comp.querySelector(`.lt-comp-p.${k} .lt-comp-detalhe`).textContent = detalhe;
        comp.querySelector(`.lt-comp-resumo-${k}`).textContent = rot[k];
        const rotulo = `${k === 'a' ? 'Período' : 'Comparar com'}: ${rot[k]}, ${detalhe}. Mudar as datas`;
        comp.querySelector(`.lt-comp-p.${k}`).setAttribute('aria-label', rotulo);
        const doResumo = comp.querySelector(`[data-resumo="${k}"]`);
        doResumo.setAttribute('aria-label', rotulo);
        doResumo.title = 'Mudar as datas';
      });
      const r = comparar(pa, pb);
      const esc = GC.escaparHtml;
      const seta = (l) => (l.delta === 0 ? 'ti-equal' : l.delta > 0 ? 'ti-arrow-up-right' : 'ti-arrow-down-right');
      // Percentual varia em pontos ("+2 p.p."); contagem e tempo, com a variação relativa ("+35 (+23%)").
      // A versão curta (só a relativa: "+23%") vale na coluna estreita da Tabela, onde o "+35" já se lê nas colunas.
      const sinal = (l) => (l.delta > 0 ? '+' : '−');
      const variacao = (l) => {
        if (l.delta === 0) return 'igual';
        if (l.unidade === '%') return `${sinal(l)}${fmt(Math.abs(l.delta), '')} p.p.`;
        return `${sinal(l)}${fmt(Math.abs(l.delta), l.unidade)}${l.b ? ` (${l.pct > 0 ? '+' : '−'}${Math.abs(l.pct)}%)` : ''}`;
      };
      const variacaoCurta = (l) => (l.delta !== 0 && l.unidade !== '%' && l.b ? `${l.pct > 0 ? '+' : '−'}${Math.abs(l.pct)}%` : variacao(l));
      // Mudança relativa (até 100%): o tamanho da barra e a ordem das linhas (a que mais mudou primeiro).
      const relativa = (l) => (!l.delta ? 0 : l.unidade === '%' ? Math.abs(l.delta) : l.b ? Math.abs(l.pct) : 100);
      const barra = (l) => (l.delta
        ? `<span class="lt-comp-barra" style="--v:${(Math.max(6, Math.min(100, relativa(l))) / 100).toFixed(2)}" aria-hidden="true"></span>` : '');
      const ordenadas = r.linhas.map((l, i) => ({ l, i })).sort((x, y) => relativa(y.l) - relativa(x.l) || x.i - y.i).map((x) => x.l);
      const iguais = ordenadas.filter((l) => !l.delta).length;
      const visiveis = estadoComp.soMudou ? ordenadas.filter((l) => l.delta) : ordenadas;
      const linhas = visiveis.map((l, i) => `<tr class="${l.tom}" style="--i:${i}">
          <th scope="row"><i class="ti ${l.icone}" aria-hidden="true"></i>${esc(l.rotulo)}</th>
          <td>${fmt(l.a, l.unidade)}</td><td>${fmt(l.b, l.unidade)}</td>
          <td class="lt-comp-var"><span class="lt-comp-v-cheia"><i class="ti ${seta(l)}" aria-hidden="true"></i>${variacao(l)}</span>`
          + `<span class="lt-comp-v-curta" title="${esc(variacao(l))}"><i class="ti ${seta(l)}" aria-hidden="true"></i>${variacaoCurta(l)}</span>${barra(l)}</td></tr>`).join('');
      const subiram = r.bairros.filter((x) => x.delta > 0).slice(0, 4);
      const cairam = r.bairros.filter((x) => x.delta < 0).slice(-3).reverse();
      // Bairro da lista: passar o mouse (ou o foco) levanta o bairro no mapa, sem mexer na câmera. Secretaria não tem lugar.
      const item = (x, i, bairro) => {
        const conteudo = `<span>${esc(x.nome)}</span><b class="${x.delta > 0 ? 'pior' : 'melhor'}">${x.delta > 0 ? '+' : '−'}${Math.abs(x.delta)}</b><small>${x.a} × ${x.b}</small>`;
        return `<li style="--i:${i}">${bairro && aoApontarBairro
          ? `<button type="button" class="lt-comp-bairro" data-bairro="${esc(x.id)}" aria-label="${esc(x.nome)}: ${x.a} × ${x.b} alertas. Mostrar no mapa">${conteudo}</button>`
          : conteudo}</li>`;
      };
      const bairroItem = (x, i) => item(x, i, true);
      const areas = r.areas.filter((x) => x.delta !== 0).slice(0, 3);
      const filtro = iguais ? `<div class="lt-comp-filtro"><span>Ordenada pela mudança</span>
          <button type="button" class="lt-comp-so-mudou" aria-pressed="${!!estadoComp.soMudou}">${estadoComp.soMudou ? `Mostrar as ${iguais} iguais` : `Esconder as ${iguais} iguais`}</button></div>` : '';
      const htmlCorpo = `${filtro}
        ${visiveis.length ? `<table class="lt-comp-tabela">
          <thead><tr><th scope="col">Indicador</th><th scope="col"><span class="lt-comp-cor a" aria-hidden="true"></span>Período</th><th scope="col"><span class="lt-comp-cor b" aria-hidden="true"></span>Comparar com</th><th scope="col">Variação</th></tr></thead>
          <tbody>${linhas}</tbody>
        </table>` : '<p class="lt-comp-vazio">Nenhum indicador mudou entre os dois períodos.</p>'}
        <div class="lt-comp-listas">
          <div><h4>Alertas subiram em</h4>${subiram.length ? `<ol>${subiram.map(bairroItem).join('')}</ol>` : '<p>Nenhum bairro.</p>'}</div>
          <div><h4>Alertas caíram em</h4>${cairam.length ? `<ol>${cairam.map(bairroItem).join('')}</ol>` : '<p>Nenhum bairro.</p>'}</div>
          <div><h4>Secretarias que mais mudaram</h4>${areas.length ? `<ol>${areas.map((x, i) => item(x, i, false)).join('')}</ol>` : '<p>Sem mudança.</p>'}</div>
        </div>
        <p class="lt-comp-nota"><i class="ti ti-map-2" aria-hidden="true"></i>No mapa, os bairros onde os alertas subiram ficam pintados (mais escuro, mais subiu)${aoApontarBairro ? '; passe o mouse num bairro da lista para achá-lo' : ''}. Alertas seguem os filtros do mapa; os outros números são da cidade toda.</p>`;
      const lado = estadoComp.lado && !!aoLadoALado;
      const chave = `${pa.inicio}|${pa.fim}|${pb.inicio}|${pb.fim}|${lado}`;
      const corpo = comp.querySelector('.lt-comp-corpo');
      // O app redesenha a cada render: só refaz o DOM se o conteúdo mudou e só anima se os períodos mudaram.
      if (htmlCorpo !== corpoHtml) {
        corpoHtml = htmlCorpo;
        corpo.classList.toggle('entrando', chave !== chaveComp && !semMovimento());
        corpo.innerHTML = htmlCorpo;
        // O bairro levantado continua marcado na lista nova; se saiu da lista (ou a vista é Dois mapas), desce.
        const aindaLa = !lado && apontado && corpo.querySelector(`[data-bairro="${apontado}"]`);
        if (aindaLa) aindaLa.classList.add('apontado'); else apontar(null);
      } else if (lado) apontar(null);
      chaveComp = chave;
      comp.classList.toggle('lado-a-lado', lado);
      marcarLateral(!lado);
      comp.querySelectorAll('[data-vista]').forEach((b) => b.setAttribute('aria-pressed', String((b.dataset.vista === 'lado') === lado)));
      if (lado) {
        if (aoPintar) aoPintar(null);
        aoLadoALado({ r, rotulos: rot });
      } else {
        if (aoLadoALado) aoLadoALado(null);
        if (aoPintar) aoPintar(r.niveis);
      }
    }

    // ---- Calendário de intervalo (dentro do painel) ----
    // Dois meses lado a lado, atalhos à esquerda, "Aplicar" no pé. O app redesenha o painel a cada render,
    // mas o calendário só muda com o que a pessoa faz (nada apaga uma escolha pela metade).
    const int = comp && comp.querySelector('.lt-int');
    let edicao = null; // { k, inicio, ate, fase: 'fim' (falta o último dia) | 'pronto', hover, foco, mes: { ano, mes } }
    const editando = () => !!edicao;
    function mesDe(t) { const d = new Date(t); return { ano: d.getFullYear(), mes: d.getMonth() }; }
    function mesMais({ ano, mes }, n) { const d = new Date(ano, mes + n, 1); return { ano: d.getFullYear(), mes: d.getMonth() }; }
    // O intervalo que o calendário mostra agora (com o hover: a prévia do que um clique faria).
    function intervaloVisto() {
      if (!edicao) return null;
      const n = estadoComp.diasA;
      if (edicao.k === 'b') {
        const ini = edicao.hover !== null ? edicao.hover : edicao.inicio;
        return { inicio: ini, ate: maisDias(ini, n - 1), previa: edicao.hover !== null };
      }
      if (edicao.fase === 'fim') {
        const outro = edicao.hover !== null ? edicao.hover : edicao.inicio;
        return { inicio: Math.min(edicao.inicio, outro), ate: Math.max(edicao.inicio, outro), previa: true };
      }
      return { inicio: edicao.inicio, ate: edicao.ate, previa: false };
    }
    // Dia que não dá para clicar: fora do último ano ou, na comparação, sem espaço para o período inteiro.
    function diaFora(d) {
      const { min, max } = GC.limitesLinhaTempo(agora(), limiteDias);
      if (d < min || d > max) return true;
      return edicao.k === 'b' && maisDias(d, estadoComp.diasA - 1) > max;
    }
    function desenharMeses() {
      const { min, max } = GC.limitesLinhaTempo(agora(), limiteDias);
      const meses = [edicao.mes, mesMais(edicao.mes, 1)];
      const hoje = GC.inicioDoDia(agora());
      const cab = `<div role="row" class="lt-cal-sem">${GC.DIAS_SEMANA.map((s) => `<span role="columnheader" aria-label="${s}">${s[0].toUpperCase()}</span>`).join('')}</div>`;
      int.querySelector('.lt-int-meses').innerHTML = meses.map(({ ano, mes }, i) => `
        <div class="lt-int-mes${i ? ' segundo' : ''}">
          <b class="lt-int-mes-nome">${GC.rotuloMes(ano, mes)}</b>
          <div class="lt-int-grade" role="grid" aria-label="${GC.rotuloMes(ano, mes)}">${cab}${GC.gradeMes(ano, mes).map((semana) => `<div role="row">${semana.map((d) => {
            if (d === null) return '<span role="gridcell"></span>';
            return `<span role="gridcell"><button type="button" class="lt-int-d${d === hoje ? ' hoje' : ''}" data-dia="${d}" tabindex="-1"${diaFora(d) ? ' disabled' : ''}`
              + ` aria-label="${GC.rotuloDiaLongo(d)}${d === hoje ? ' (hoje)' : ''}">${new Date(d).getDate()}</button></span>`;
          }).join('')}</div>`).join('')}</div>
        </div>`).join('');
      const [ant, prox] = int.querySelectorAll('.lt-int-nav');
      ant.disabled = new Date(meses[0].ano, meses[0].mes, 1).getTime() <= min;
      prox.disabled = new Date(meses[1].ano, meses[1].mes + 1, 0).getTime() >= max;
      pintarDias();
    }
    // Só troca classes (sem refazer o DOM): o hover anda a cada movimento do mouse.
    function pintarDias() {
      const v = intervaloVisto();
      const { pa, pb } = periodosAtuais();
      const outro = edicao.k === 'a' ? pb : pa; // o outro período aparece de leve, na cor dele
      int.querySelectorAll('[data-dia]').forEach((b) => {
        const d = Number(b.dataset.dia);
        const dentro = d >= v.inicio && d <= v.ate;
        b.classList.toggle('no-intervalo', dentro);
        b.classList.toggle('ponta-ini', d === v.inicio);
        b.classList.toggle('ponta-fim', d === v.ate);
        b.classList.toggle('previa', dentro && v.previa);
        b.classList.toggle('no-outro', d >= outro.inicio && d <= outro.ate);
        b.setAttribute('aria-selected', String(dentro && !v.previa));
        b.tabIndex = d === edicao.foco ? 0 : -1;
      });
      int.classList.toggle('escolhendo-fim', edicao.k === 'a' && edicao.fase === 'fim');
      const n = Math.round((maisDias(v.ate, 1) - v.inicio) / (24 * 3600000));
      const dias = `${n} ${n === 1 ? 'dia' : 'dias'}`;
      const escolha = int.querySelector('.lt-int-escolha');
      if (edicao.k === 'a' && edicao.fase === 'fim') {
        escolha.innerHTML = `<b>${curto(edicao.inicio)}</b> a … <span>Agora clique no último dia (até ${GC.MAX_DIAS_COMPARAR} dias)</span>`;
      } else {
        escolha.innerHTML = `<b>${v.inicio === v.ate ? curto(v.inicio) : `${curto(v.inicio)} a ${curto(v.ate)}`}</b> · ${dias}`
          + (edicao.k === 'b' ? ` <span>(o mesmo tamanho do período)</span>` : '');
      }
      int.querySelector('.lt-int-aplicar').disabled = edicao.k === 'a' && edicao.fase === 'fim';
      // Atalho marcado quando o intervalo escolhido é o dele.
      int.querySelectorAll('[data-atalho-int]').forEach((b) => {
        const ini = Number(b.dataset.inicio);
        b.setAttribute('aria-pressed', String(!v.previa && ini === v.inicio && Number(b.dataset.ate) === v.ate));
      });
    }
    function desenharAtalhos() {
      const { pa, min, max } = periodosAtuais();
      let lista;
      if (edicao.k === 'a') {
        lista = GC.atalhosPeriodo(agora()).filter((x) => x.inicio >= min && x.ate <= max);
      } else {
        lista = GC.referenciasComparar(pa.dias).map((r) => {
          const p = GC.encaixarPeriodo(GC.periodoReferencia(pa, r.id, agora()), min, max, agora());
          return { id: r.id, rotulo: r.rotulo, titulo: r.titulo, inicio: p.inicio, ate: p.ate };
        });
      }
      int.querySelector('.lt-int-atalhos').innerHTML = lista.map((x) => `<button type="button" data-atalho-int="${x.id}" data-inicio="${x.inicio}" data-ate="${x.ate}"`
        + ` aria-pressed="false"${x.titulo ? ` title="${GC.escaparHtml(x.titulo)}"` : ''}><span>${GC.escaparHtml(x.rotulo)}</span>`
        + `<small>${x.inicio === x.ate ? curto(x.inicio) : `${curto(x.inicio)} a ${curto(x.ate)}`}</small></button>`).join('');
    }
    function abrirEdicao(k) {
      if (edicao && edicao.k === k) return cancelarEdicao();
      const { pa, pb } = periodosAtuais();
      const p = k === 'a' ? pa : pb;
      // O segundo mês é o do último dia do período: o primeiro, o anterior.
      edicao = { k, inicio: p.inicio, ate: p.ate, fase: 'pronto', hover: null, foco: p.inicio, mes: mesMais(mesDe(p.ate), -1) };
      int.querySelector('.lt-int-tit').textContent = k === 'a' ? 'Escolher o período' : 'Escolher com o que comparar';
      int.querySelector('.lt-int-ajuda').textContent = k === 'a'
        ? 'Clique no primeiro e no último dia, ou use um atalho.'
        : `Clique no primeiro dia: a comparação tem ${pa.dias} ${pa.dias === 1 ? 'dia' : 'dias'}, como o período.`;
      int.classList.toggle('de-b', k === 'b');
      comp.classList.add('editando');
      recolher(false);
      comp.querySelectorAll('[data-editar]').forEach((b) => b.setAttribute('aria-expanded', String(b.dataset.editar === k)));
      GC.mostrarAnimado(int);
      desenharAtalhos();
      desenharMeses();
      const f = int.querySelector('[data-dia][tabindex="0"]');
      if (f) f.focus();
    }
    // Devolve true se estava editando (o Esc fecha primeiro o calendário, depois o painel).
    function cancelarEdicao(devolverFoco = true) {
      if (!edicao) return false;
      const k = edicao.k;
      edicao = null;
      comp.classList.remove('editando');
      comp.querySelectorAll('[data-editar]').forEach((b) => b.setAttribute('aria-expanded', 'false'));
      GC.esconderAnimado(int);
      // Na coluna da Tabela, os períodos voltam para a linha-resumo (lá não há botão de recolher).
      const lateral = comp.classList.contains('lateral');
      if (lateral) recolher(true);
      if (devolverFoco) comp.querySelector(lateral ? `[data-resumo="${k}"]` : `[data-editar="${k}"]`).focus();
      return true;
    }
    function aplicar(inicio, ate, modo) {
      const k = edicao.k;
      cancelarEdicao(false);
      if (k === 'a') {
        const p = GC.periodoEntre(inicio, ate, agora());
        estadoComp.diasA = p.dias;
        if (p.ate !== inicioDia) trocarDia(p.ate); else desenharComparacao();
      } else {
        estadoComp.modo = modo || 'livre';
        estadoComp.bInicio = modo ? null : inicio;
        desenharComparacao();
      }
      // Escolhido: os cartões viram a linha-resumo (cada período nela abre as datas dele direto) e a tabela ou
      // os mapas ganham o espaço.
      recolher(true);
      comp.querySelector(`[data-resumo="${k}"]`).focus();
    }
    function clicarDia(d) {
      if (diaFora(d)) return;
      edicao.foco = d;
      if (edicao.k === 'b') { edicao.inicio = d; edicao.ate = maisDias(d, estadoComp.diasA - 1); edicao.hover = null; return pintarDias(); }
      if (edicao.fase === 'fim') {
        let ini = Math.min(edicao.inicio, d);
        const fim = Math.max(edicao.inicio, d);
        if ((maisDias(fim, 1) - ini) / (24 * 3600000) > GC.MAX_DIAS_COMPARAR) ini = maisDias(fim, -(GC.MAX_DIAS_COMPARAR - 1));
        Object.assign(edicao, { inicio: ini, ate: fim, fase: 'pronto', hover: null });
      } else {
        Object.assign(edicao, { inicio: d, ate: d, fase: 'fim', hover: null });
      }
      pintarDias();
    }
    // Põe o foco num dia, trocando os meses se ele estiver fora dos dois à vista.
    function focarDiaInt(d) {
      const { min, max } = GC.limitesLinhaTempo(agora(), limiteDias);
      const alvo = Math.min(max, Math.max(min, d));
      const m = mesDe(alvo);
      const [m1, m2] = [edicao.mes, mesMais(edicao.mes, 1)];
      const igual = (x, y) => x.ano === y.ano && x.mes === y.mes;
      edicao.foco = alvo;
      if (!igual(m, m1) && !igual(m, m2)) { edicao.mes = alvo < new Date(m1.ano, m1.mes, 1).getTime() ? m : mesMais(m, -1); desenharMeses(); } else pintarDias();
      const b = int.querySelector(`[data-dia="${alvo}"]`);
      if (b) b.focus();
    }
    if (int) {
      int.querySelector('.lt-int-meses').addEventListener('click', (ev) => {
        const b = ev.target.closest('[data-dia]');
        if (b && !b.disabled) clicarDia(Number(b.dataset.dia));
      });
      int.querySelector('.lt-int-meses').addEventListener('pointerover', (ev) => {
        const b = ev.target.closest('[data-dia]');
        const novo = b && !b.disabled && (edicao.k === 'b' || edicao.fase === 'fim') ? Number(b.dataset.dia) : null;
        if (novo !== edicao.hover) { edicao.hover = novo; pintarDias(); }
      });
      int.querySelector('.lt-int-meses').addEventListener('pointerleave', () => { if (edicao && edicao.hover !== null) { edicao.hover = null; pintarDias(); } });
      int.querySelector('.lt-int-meses').addEventListener('keydown', (ev) => {
        const b = ev.target.closest('[data-dia]');
        if (!b) return;
        const d = Number(b.dataset.dia);
        const passos = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
        if (passos[ev.key]) { ev.preventDefault(); focarDiaInt(maisDias(d, passos[ev.key])); return; }
        if (ev.key === 'PageUp' || ev.key === 'PageDown') { ev.preventDefault(); focarDiaInt(GC.mesesAntes(d, ev.key === 'PageUp' ? 1 : -1)); }
      });
      int.querySelectorAll('.lt-int-nav').forEach((b) => b.addEventListener('click', () => {
        edicao.mes = mesMais(edicao.mes, Number(b.dataset.mes));
        desenharMeses();
      }));
      // Atalho: aplica na hora.
      int.querySelector('.lt-int-atalhos').addEventListener('click', (ev) => {
        const b = ev.target.closest('[data-atalho-int]');
        if (!b) return;
        aplicar(Number(b.dataset.inicio), Number(b.dataset.ate), edicao.k === 'b' ? b.dataset.atalhoInt : null);
      });
      int.querySelector('.lt-int-aplicar').addEventListener('click', () => {
        const v = intervaloVisto();
        aplicar(edicao.inicio, edicao.k === 'b' ? edicao.ate : v.ate, null);
      });
      int.querySelector('.lt-int-cancelar').addEventListener('click', () => cancelarEdicao());
    }

    // Recolhido: só a linha de cima, com o resumo dos dois períodos (lado a lado, os mapas ficam à vista).
    function recolher(sim) {
      if (!comp) return;
      if (sim) cancelarEdicao(false);
      estadoComp.recolhido = sim;
      comp.classList.toggle('recolhido', sim);
      const b = comp.querySelector('.lt-comp-recolher');
      b.setAttribute('aria-expanded', String(!sim));
      b.setAttribute('aria-label', sim ? 'Mostrar a escolha dos períodos' : 'Recolher a escolha dos períodos');
      b.title = sim ? 'Mostrar' : 'Recolher';
      comp.querySelectorAll('[data-resumo]').forEach((x) => { x.tabIndex = sim ? 0 : -1; });
    }
    function abrirComparacao() {
      fecharCalendario(false);
      GC.mostrarAnimado(comp);
      btnComp.setAttribute('aria-expanded', 'true');
      el.classList.add('com-comparacao');
      // Na Tabela, os períodos de fábrica já servem: abre recolhido, com a tabela à vista.
      const tabela = !(estadoComp.lado && aoLadoALado);
      recolher(tabela);
      chaveComp = '';
      desenharComparacao();
      comp.querySelector(tabela ? '[data-resumo="a"]' : '[data-editar="a"]').focus();
    }
    function fecharComparacao(devolverFoco = true) {
      if (!compAberto()) return false;
      cancelarEdicao(false);
      GC.esconderAnimado(comp);
      btnComp.setAttribute('aria-expanded', 'false');
      el.classList.remove('com-comparacao');
      marcarLateral(false);
      if (aoPintar) aoPintar(null);
      if (aoLadoALado) aoLadoALado(null);
      apontar(null);
      if (devolverFoco) btnComp.focus();
      return true;
    }
    if (comp) {
      btnComp.addEventListener('click', () => (compAberto() ? fecharComparacao() : abrirComparacao()));
      comp.querySelector('.lt-comp-x').addEventListener('click', () => fecharComparacao());
      comp.querySelector('.lt-comp-recolher').addEventListener('click', () => recolher(!estadoComp.recolhido));
      // "Esconder as iguais" e os bairros das listas (o corpo é refeito a cada mudança: eventos no corpo).
      const corpoComp = comp.querySelector('.lt-comp-corpo');
      corpoComp.addEventListener('click', (ev) => {
        if (ev.target.closest('.lt-comp-so-mudou')) {
          estadoComp.soMudou = !estadoComp.soMudou;
          desenharComparacao();
          const b = corpoComp.querySelector('.lt-comp-so-mudou');
          if (b) b.focus();
          return;
        }
        // Toque (sem mouse por cima): o clique alterna o bairro levantado.
        const b = ev.target.closest('[data-bairro]');
        if (b) apontar(apontado === b.dataset.bairro ? null : b.dataset.bairro);
      });
      const doBairro = (ev) => { const b = ev.target.closest && ev.target.closest('[data-bairro]'); return b ? b.dataset.bairro : null; };
      corpoComp.addEventListener('pointerover', (ev) => { const id = doBairro(ev); if (id) apontar(id); });
      corpoComp.addEventListener('pointerout', (ev) => { if (doBairro(ev) && !(ev.relatedTarget && ev.relatedTarget.closest && ev.relatedTarget.closest('[data-bairro]'))) apontar(null); });
      corpoComp.addEventListener('focusin', (ev) => { const id = doBairro(ev); if (id) apontar(id); });
      corpoComp.addEventListener('focusout', (ev) => { if (doBairro(ev)) apontar(null); });
      // Cada período da linha-resumo abre direto as datas dele.
      comp.querySelectorAll('[data-resumo]').forEach((b) => b.addEventListener('click', () => abrirEdicao(b.dataset.resumo)));
      comp.querySelectorAll('[data-editar]').forEach((b) => b.addEventListener('click', () => abrirEdicao(b.dataset.editar)));
      // Mexer num dos mapas lado a lado recolhe o painel: o mapa fica à vista inteiro.
      document.addEventListener('pointerdown', (ev) => {
        if (compAberto() && estadoComp.lado && !estadoComp.recolhido && ev.target.closest && ev.target.closest('.cmp-mapas')) recolher(true);
      }, true);
      const vista = comp.querySelector('.lt-comp-vista');
      if (vista) vista.addEventListener('click', (ev) => {
        const b = ev.target.closest('[data-vista]');
        if (!b) return;
        estadoComp.lado = b.dataset.vista === 'lado';
        if (!estadoComp.lado) recolher(true); // a tabela é o conteúdo: os cartões dos períodos saem da frente
        desenharComparacao();
      });
      // Inverter: o período de comparação vira o período (e o dia da régua) e o período vira a comparação.
      const btnTrocar = comp.querySelector('.lt-comp-trocar');
      btnTrocar.addEventListener('click', () => {
        cancelarEdicao(false);
        const { pa, pb } = periodosAtuais();
        estadoComp.modo = 'livre';
        estadoComp.bInicio = pa.inicio;
        btnTrocar.classList.toggle('girou');
        trocarDia(pb.ate);
      });
    }

    function abrir() {
      const estava = visivel(el);
      GC.mostrarAnimado(el);
      document.body.classList.add('com-linha-tempo');
      marcar(); // acompanharRelogio escreve o dia e, ao vivo, põe a régua em agora (no dia novo, se virou)
      if (!estava && aoAbrirFechar) aoAbrirFechar(true); // a barra ocupa a base: o mapa reenquadra acima dela
    }
    function fechar() {
      const estava = visivel(el);
      parar();
      fecharCalendario(false);
      fecharComparacao(false);
      pararDeslize();
      // Fechou no passado: volta ao vivo na hora (sem deslize, a barra está saindo).
      if (instante !== null) { inicioDia = GC.inicioDoDia(agora()); rotularDia(); irPara(PASSOS); }
      GC.esconderAnimado(el);
      document.body.classList.remove('com-linha-tempo');
      if (estava && aoAbrirFechar) aoAbrirFechar(false);
    }
    return {
      abrir, fechar,
      alternar: () => (visivel(el) ? fechar() : abrir()),
      aberta: () => visivel(el),
      instante: () => instante,
      // Esc: fecha primeiro o que estiver suspenso (calendário ou comparação); devolve true se fechou algo.
      fecharCalendario: () => fecharCalendario() || cancelarEdicao() || fecharComparacao(),
      marcar, // o app informa quantas estão abertas no instante
      comparando: compAberto,
      atualizarComparacao: desenharComparacao, // filtros do mapa mudaram: os alertas da comparação acompanham
      atualizarChips: marcarChips, // camada ligada ou desligada fora dos chips (painel Camadas, "Limpar todas")
    };
  };

  // ======================= Modo telão =======================
  // Para a TV da sala de situação: tela cheia, o mapa e um cartão no canto. Cada volta é um roteiro:
  // abre com os números da cidade e depois alterna dois alertas (a câmera voa até cada um e gira devagar
  // em volta dele) com uma cena de contexto (secretarias, resolvidas…), que muda de uma volta para a outra.
  // As cenas ficam em js/telao/cena-*.js, registradas em GC.cenasTelao. Um alerta novo interrompe o roteiro,
  // aparece como "Nova" e a câmera vai até ele; uma ocorrência resolvida ganha um cartão rápido antes do
  // passo seguinte. "Pausar câmera" (ou Espaço) congela o movimento e libera o mapa para mexer à mão;
  // "Retomar" volta. Sai com Esc, com o botão "Sair" ou saindo da tela cheia.

  // Cena: { id, ordem, nome, descricao, abertura?, fixa?, montar(ctx) → { rotulo, sub, titulo, html, foco?, niveis? } | null }.
  // As de abertura (crise, números) abrem cada volta, pela ordem; as outras se revezam entre os alertas.
  // fixa: não pode ser desligada nos ajustes. foco: id de uma ocorrência para a câmera ir até ela.
  // niveis: { idDoBairro: 0 a 4 } pinta os bairros no mapa enquanto a cena está na tela.
  // disponivel(dados) (opcional): diz, sem montar, se a cena tem o que mostrar (para o "A seguir" não anunciar
  // uma cena que vai ser pulada).
  // ctx: { dados, fila: { total, criterio, alertas }, memoria } (memoria: objeto da cena, guardado entre as voltas).
  // Uma cena que devolve null (nada a mostrar agora) é pulada.
  GC.cenasTelao = GC.cenasTelao || [];
  GC.RITMOS_TELAO = [6, 8, 12, 16]; // segundos em cada ponto (o botão do telão alterna entre eles)

  // Ajustes salvos no navegador, sempre num formato válido (um valor estranho volta ao padrão).
  GC.ajustesTelaoValidos = function (salvo = {}) {
    const s = salvo || {};
    return {
      ritmo: GC.RITMOS_TELAO.includes(s.ritmo) ? s.ritmo : 8,
      cenasDesligadas: Array.isArray(s.cenasDesligadas) ? s.cenasDesligadas.filter((x) => typeof x === 'string') : [],
      soCriticas: s.soCriticas === true,
      // Mapa no tema noturno enquanto o telão está ligado (padrão): numa sala escura, a TV não ofusca e
      // pinos e cartões se destacam. Não muda o tema guardado do painel.
      mapaEscuro: s.mapaEscuro !== false,
    };
  };

  // Roteiro de uma volta: as cenas de abertura, depois `aCada` alertas e uma cena de contexto, até
  // acabarem os alertas. As cenas de contexto giram a cada volta (giro) e não se repetem na mesma volta.
  // Sem alertas, passa por todas as cenas. Devolve [{ tipo: 'cena' | 'alerta', id }].
  GC.roteiroTelao = function (alertas, { abertura = [], contexto: outras = [] } = {}, { aCada = 2, giro = 0 } = {}) {
    const n = outras.length;
    const contexto = n ? [...outras.slice(giro % n), ...outras.slice(0, giro % n)] : [];
    const passos = abertura.map((id) => ({ tipo: 'cena', id }));
    if (!alertas.length) return passos.concat(contexto.map((id) => ({ tipo: 'cena', id })));
    let k = 0;
    alertas.forEach((id, i) => {
      passos.push({ tipo: 'alerta', id });
      const fimDoGrupo = (i + 1) % aCada === 0 || i === alertas.length - 1;
      if (fimDoGrupo && k < contexto.length) passos.push({ tipo: 'cena', id: contexto[k++] });
    });
    return passos;
  };

  // Frase da cidade inteira (abertura e cartão de entrada).
  GC.textoCidadeTelao = function ({ total, criterio }) {
    if (!total) return 'Nenhuma ocorrência pede atenção agora';
    if (criterio === 'criticas') return `${total} ${total === 1 ? 'ocorrência crítica ativa' : 'ocorrências críticas ativas'}`;
    return `${total} ${total === 1 ? 'ocorrência precisa' : 'ocorrências precisam'} de atenção`;
  };

  // Rodapé do telão: as ocorrências mais recentes numa fita que corre devagar. Hora fixa (14:05), não
  // "há 5 min": o texto só muda quando a lista muda, e a fita não recomeça a cada passo.
  GC.htmlRodapeTelao = function (lista, onde) {
    const esc = (t) => GC.escaparHtml(String(t));
    const hhmm = (t) => new Date(t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    return lista.map((o) => {
      const resolvida = o.status === 'resolvida';
      return `<span class="trf-item sev-${o.severidade}${resolvida ? ' resolvida' : ''}"><time>${hhmm(o.criadaEm)}</time>`
        + (resolvida ? '<i class="ti ti-circle-check" aria-hidden="true"></i>' : '<i class="trf-sev" aria-hidden="true"></i>')
        + `<b>${esc(o.titulo)}</b><small>${esc(onde(o))}${resolvida ? ' · resolvida' : ''}</small></span>`;
    }).join('');
  };

  // lista() → { itens, total, criterio: 'atencao' | 'criticas' }; buscar(id) → a ocorrência ativa ou null;
  // dados() → o que as cenas leem; noFiltro(o) → a ocorrência (mesmo resolvida) passa nos filtros do mapa;
  // feed() → as ocorrências mais recentes (rodapé); crises() → títulos dos gabinetes de crise ativos (selo no canto);
  // armazenamento: { ler(), gravar(config) } para os ajustes (ritmo, cenas desligadas, só críticas).
  GC.criarTelao = function ({ mapa, lista, buscar, descrever, dados, noFiltro, feed, crises, aoMudar, filtro, armazenamento }) {
    const GIRO_PONTO = 18; // graus que a câmera gira em volta do alerta enquanto está nele
    const GIRO_CIDADE = 10;
    const EXTRA_CENA_MS = 2000; // as cenas têm mais para ler que o cartão de um alerta
    const RESOLVIDA_MS = 5000;
    const config = GC.ajustesTelaoValidos((armazenamento && armazenamento.ler()) || {});
    const gravar = () => { if (armazenamento) armazenamento.gravar(Object.assign({}, config, { cenasDesligadas: config.cenasDesligadas.slice() })); };
    const passaCriticas = (o) => !config.soCriticas || o.severidade === 'critica';
    const noPontoMs = () => config.ritmo * 1000;

    const el = document.createElement('div');
    el.className = 'telao';
    el.hidden = true;
    // O cabeçalho do painel some no telão (chips, perfil e botões não servem na parede): no lugar, só a marca.
    el.innerHTML = `
      <div class="telao-marca"><img alt="" hidden><b></b><span class="telao-demo">Dados fictícios</span></div>
      <div class="telao-faixa" role="status" hidden></div>
      <div class="telao-cartao" aria-live="polite"></div>
      <div class="telao-rodape" hidden><span class="trf-vivo"><span class="ponto"></span> Últimas ocorrências</span><div class="trf-trilho"><div class="trf-fita"></div></div></div>
      <div class="telao-canto"><span class="telao-crise" hidden></span><span class="telao-filtro" hidden></span><span class="telao-relogio"></span><span class="telao-vivo"><span class="ponto"></span> Ao vivo</span></div>
      <div class="telao-botoes">
        <button type="button" class="telao-ritmo"></button>
        <button type="button" class="telao-tema" aria-pressed="false"></button>
        <button type="button" class="telao-pausar" aria-pressed="false"></button>
        <button type="button" class="telao-sair"><i class="ti ti-x" aria-hidden="true"></i> Sair do telão <kbd>Esc</kbd></button>
      </div>`;
    document.body.appendChild(el);
    const cartao = el.querySelector('.telao-cartao');
    const btnPausar = el.querySelector('.telao-pausar');
    const btnRitmo = el.querySelector('.telao-ritmo');
    const faixa = el.querySelector('.telao-faixa');
    const rodape = el.querySelector('.telao-rodape');
    const fita = el.querySelector('.trf-fita');
    let fitaAtual = '';
    // Refeita só quando a lista muda (nova, resolvida, filtro). A fita leva os itens duas vezes e anda
    // metade da largura, para emendar sem salto; ~45 px por segundo, o ritmo lento do telão.
    function atualizarRodape() {
      marcarCrise();
      const itens = (feed ? feed() : []).filter(passaCriticas);
      const html = GC.htmlRodapeTelao(itens, (o) => descrever(o).onde);
      rodape.hidden = !itens.length;
      el.classList.toggle('com-rodape', !!itens.length);
      if (html === fitaAtual) return;
      fitaAtual = html;
      fita.innerHTML = `<div class="trf-grupo">${html}</div><div class="trf-grupo" aria-hidden="true">${html}</div>`;
      fita.style.setProperty('--dur', `${Math.max(20, Math.round(fita.scrollWidth / 2 / 45))}s`);
    }
    // Na TV ninguém mexe no mouse: sem movimento por 3 s, somem os botões e o cursor (menos pausado,
    // quando o botão "Retomar" precisa estar à vista).
    let ocioso = null;
    function acordar() {
      if (!ativo) return;
      document.body.classList.remove('telao-ocioso');
      clearTimeout(ocioso);
      ocioso = setTimeout(() => { if (ativo && !pausado) document.body.classList.add('telao-ocioso'); }, 3000);
    }
    document.addEventListener('mousemove', acordar, { passive: true });
    let ativo = false;
    let pausado = false;
    let passo = null;
    let giro = null;
    let roteiro = []; // [{ tipo, id }]: alertas por id, não objetos (cada passo busca o estado atual)
    let indice = -1;
    let volta = 0; // quantas voltas já começaram (gira as cenas de contexto)
    let filaInfo = { total: 0, criterio: 'atencao', alertas: 0 };
    let novas = new Set(); // ids que entraram no roteiro por novidade() (o cartão diz "Nova")
    let memorias = {}; // id da cena → memória dela (para dizer o que mudou desde a última volta)
    let resolvidas = []; // resolvidas esperando o cartão rápido
    let naCidade = false; // a câmera já está na cidade inteira (as cenas só seguem girando)
    let pintado = false; // uma cena pintou os bairros: o passo seguinte apaga
    // Ponto em foco: anel em volta dele e os outros pinos esmaecidos (body.telao-focando), para não
    // haver dúvida de qual pino é o do cartão. O passo seguinte solta.
    function focarPonto(id) {
      if (mapa.marcarAlvo) mapa.marcarAlvo(id);
      document.body.classList.add('telao-focando');
    }
    function soltarPonto() {
      if (mapa.marcarAlvo) mapa.marcarAlvo(null);
      document.body.classList.remove('telao-focando');
    }
    // Os dados das cenas, calculados uma vez por passo (o "A seguir" e a cena usam os mesmos).
    let dadosPasso = null;
    const dadosAgora = () => dadosPasso || (dadosPasso = dados ? dados() : {});
    const temOQueMostrar = (c) => !c.disponivel || c.disponivel(dadosAgora());
    function pintar(niveis) {
      if (!niveis && !pintado) return;
      if (mapa.pintarNiveis) mapa.pintarNiveis(niveis || null);
      pintado = !!niveis;
    }
    let relogio = null;
    // Cada passo ganha um número; um voo que termina depois de outro passo começar é ignorado.
    let geracao = 0;
    const semMovimento = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const esc = (t) => GC.escaparHtml(String(t));

    const esperar = (ms, fn) => { clearTimeout(passo); passo = setTimeout(fn, ms); };
    function pararTudo() {
      geracao++;
      clearTimeout(passo);
      clearTimeout(giro);
      mapa.pararCamera();
    }
    // Giro lento em volta do centro atual, até o próximo passo (que interrompe o giro ao voar).
    function girar(graus, ms) {
      if (!semMovimento()) mapa.girarDevagar(graus, ms);
    }
    // Cidade inteira girando devagar; se a câmera já está lá, só continua o giro.
    // A cidade fica no centro da área à direita do cartão; se o cartão mudou bem de largura, reenquadra.
    let espacoNaCidade = 0;
    function irParaCidade(meu, ms) {
      const esquerda = espacoEsquerda();
      if (naCidade && Math.abs(esquerda - espacoNaCidade) < 60) return girar(GIRO_CIDADE, ms);
      naCidade = true;
      espacoNaCidade = esquerda;
      mapa.acender(null);
      mapa.visaoGeral(2.2, { esquerda });
      giro = setTimeout(() => { if (meu === geracao) girar(GIRO_CIDADE, Math.max(0, ms - 2300)); }, 2300);
    }
    // Gabinete de crise ativo: selo vermelho no canto, à vista o tempo todo (a cena da crise abre cada volta).
    function marcarCrise() {
      const lista = crises ? crises() : [];
      const alvo = el.querySelector('.telao-crise');
      alvo.hidden = !lista.length;
      alvo.innerHTML = lista.length === 1 ? `<i class="ti ti-urgent" aria-hidden="true"></i> Gabinete de crise: ${esc(lista[0])}`
        : lista.length ? `<i class="ti ti-urgent" aria-hidden="true"></i> ${lista.length} gabinetes de crise ativos` : '';
    }
    // Filtro ativo no mapa (o telão segue ele): à vista no canto, para não parecer que sumiu ocorrência.
    function marcarFiltro() {
      const f = filtro ? filtro() : '';
      const alvo = el.querySelector('.telao-filtro');
      alvo.hidden = !f;
      alvo.textContent = f ? `Filtro: ${f}` : '';
    }
    const cenasEmOrdem = () => GC.cenasTelao.slice().sort((a, b) => a.ordem - b.ordem);
    const cenaPorId = (id) => GC.cenasTelao.find((c) => c.id === id);
    function novaVolta() {
      marcarFiltro();
      const r = lista({ soCriticas: config.soCriticas });
      filaInfo = { total: r.total, criterio: r.criterio, alertas: r.itens.length };
      const ligadas = cenasEmOrdem().filter((c) => c.fixa || !config.cenasDesligadas.includes(c.id));
      roteiro = GC.roteiroTelao(r.itens.map((o) => o.id), {
        abertura: ligadas.filter((c) => c.abertura).map((c) => c.id),
        contexto: ligadas.filter((c) => !c.abertura).map((c) => c.id),
      }, { giro: volta++ });
      indice = -1;
      novas = new Set();
    }
    // O que vem depois (para o "A seguir"): o título do próximo alerta ativo ou o nome da cena.
    function seguinte() {
      for (let i = indice + 1; i < roteiro.length; i++) {
        const p = roteiro[i];
        if (p.tipo === 'alerta') { const o = buscar(p.id); if (o) return o.titulo; } else { const c = cenaPorId(p.id); if (c && temOQueMostrar(c)) return c.nome; }
      }
      const abertura = cenasEmOrdem().find((c) => c.abertura && (c.fixa || !config.cenasDesligadas.includes(c.id)) && temOQueMostrar(c));
      return abertura ? abertura.nome : '';
    }
    const htmlSeguir = (atual) => {
      const prox = seguinte();
      return prox && prox !== atual ? `<div class="tc-seguir"><small>A seguir</small> ${esc(prox)}</div>` : '';
    };
    // O ponto fica no centro da área à direita do cartão (que está no canto inferior esquerdo).
    // Tela estreita (o cartão ocupa quase tudo): centro normal.
    const espacoEsquerda = () => {
      const direita = cartao.getBoundingClientRect().right;
      return direita > window.innerWidth * 0.6 ? 0 : Math.round(direita) + 32; // folga: o pino não encosta no cartão
    };
    const htmlProgresso = (ms, andando) => `<i class="telao-progresso${andando ? ' andando' : ''}" style="--dur:${ms}ms"></i>`;

    // ---- Cena ----
    function mostrarCena(cena, meu) {
      let r = null;
      try {
        r = cena.montar({ dados: dadosAgora(), fila: filaInfo, memoria: memorias[cena.id] || (memorias[cena.id] = {}) });
      } catch (erro) { console.error(erro); } // uma cena com defeito não pode travar a TV: pula
      if (!r) return false;
      pintar(r.niveis);
      const ms = noPontoMs() + EXTRA_CENA_MS;
      cartao.className = `telao-cartao cidade cena cena-${cena.id}`;
      cartao.innerHTML = `<div class="tc-topo"><span class="tc-sev">${esc(r.rotulo || cena.nome)}</span>${r.sub ? `<span class="tc-area">${esc(r.sub)}</span>` : ''}</div>
        <b class="tc-titulo">${esc(r.titulo)}</b>
        ${r.html || ''}
        ${htmlSeguir(cena.nome)}
        ${htmlProgresso(ms, true)}`;
      const foco = r.foco ? buscar(r.foco) : null;
      if (foco) {
        naCidade = false;
        focarPonto(foco.id);
        mapa.sobrevoar(foco.id, { espacoEsquerda }).then((chegou) => { if (chegou && ativo && meu === geracao) girar(GIRO_PONTO, ms); });
      } else irParaCidade(meu, ms);
      esperar(ms, proximo);
      return true;
    }
    // Sem cena nenhuma e sem alerta: só a cidade girando, com a frase do total.
    function mostrarCidade(meu) {
      cartao.className = 'telao-cartao cidade';
      cartao.innerHTML = `<div class="tc-topo"><span class="tc-sev">Visão geral</span></div><b class="tc-titulo">${esc(GC.textoCidadeTelao(filaInfo))}</b>`;
      irParaCidade(meu, noPontoMs());
      esperar(noPontoMs(), proximo);
    }

    // ---- Resolvida (cartão rápido, antes do passo seguinte) ----
    function mostrarResolvidas(meu) {
      const lote = resolvidas.splice(0);
      cartao.className = 'telao-cartao resolvida';
      const topo = (texto, area) => `<div class="tc-topo"><span class="tc-sev"><i class="ti ti-circle-check" aria-hidden="true"></i> ${texto}</span>${area ? `<span class="tc-area">${esc(area)}</span>` : ''}</div>`;
      if (lote.length === 1) {
        const o = lote[0];
        const d = descrever(o);
        const min = o.resolvidaEm && o.criadaEm ? (o.resolvidaEm - o.criadaEm) / 60000 : null;
        const meta = [`📍 ${esc(d.onde)}`, min === null ? '' : `Resolvida em ${esc(GC.tempoTexto(min))}`].filter(Boolean).map((t) => `<span>${t}</span>`).join('');
        cartao.innerHTML = `${topo('Resolvida', d.area)}
          <b class="tc-titulo">${esc(o.titulo)}</b>
          <div class="tc-meta">${meta}</div>
          <div class="tc-no-prazo ${o.noPrazo ? 'sim' : 'nao'}">${o.noPrazo ? 'Dentro do prazo' : 'Fora do prazo'}</div>
          ${htmlProgresso(RESOLVIDA_MS, true)}`;
      } else {
        const vistas = lote.slice(0, 3);
        const resto = lote.length - vistas.length;
        cartao.innerHTML = `${topo('Resolvidas')}
          <b class="tc-titulo">${lote.length} ocorrências resolvidas agora</b>
          <ul class="tr-lista">${vistas.map((o) => `<li><i class="ti ti-circle-check" aria-hidden="true"></i><span>${esc(o.titulo)}<small>${esc(descrever(o).onde)}</small></span></li>`).join('')}</ul>
          ${resto ? `<div class="tc-seguir">e mais ${resto}</div>` : ''}
          ${htmlProgresso(RESOLVIDA_MS, true)}`;
      }
      irParaCidade(meu, RESOLVIDA_MS);
      esperar(RESOLVIDA_MS, proximo);
    }

    // ---- Alerta ----
    // Bloco do prazo: o que a equipe tem de fazer e até quando, com a barra do prazo já consumido.
    function htmlPrazo(p) {
      if (p.estado === 'campo') return `<div class="tc-prazo campo"><small>Situação</small><strong>🚧 ${esc(p.texto)}</strong></div>`;
      if (p.estado === 'atrasada') {
        return `<div class="tc-prazo atrasada"><small>⏰ ${esc(p.rotulo)}</small><strong>${esc(p.tempo)}</strong><span>${esc(p.detalhe)}</span></div>`;
      }
      const nivel = p.usadoPct >= 85 ? 'quase' : p.usadoPct >= 60 ? 'meio' : '';
      return `<div class="tc-prazo correndo ${nivel}" style="--usado:${p.usadoPct.toFixed(0)}%"><small>${esc(p.rotulo)}</small><strong>${esc(p.tempo)}</strong>
        <i class="tc-prazo-barra" aria-hidden="true"></i></div>`;
    }
    function desenharCartao(o, nova, extra = '') {
      const d = descrever(o);
      cartao.className = `telao-cartao ${o.severidade}${nova ? ' nova' : ''}`;
      // Posição na volta em texto ("Alerta 3 de 6"): bolinhas não se leem de longe. A nova leva a etiqueta no lugar.
      const alertas = roteiro.filter((p) => p.tipo === 'alerta');
      const atual = alertas.indexOf(roteiro[indice]);
      const pontos = alertas.length > 1 && atual >= 0 ? `<span class="tc-fila">Alerta ${atual + 1} de ${alertas.length}</span>` : '';
      const topo = `<span class="tc-sev">${nova ? 'Nova · ' : ''}${esc(d.gravidade)}</span><span class="tc-area">${esc(d.area)}</span>${nova ? '' : pontos}`;
      const meta = [`📍 ${esc(d.onde)}`, d.afetados ? `👥 ${d.afetados.toLocaleString('pt-BR')} pessoas afetadas` : '', ...d.motivos.map(esc)]
        .filter(Boolean).map((t) => `<span>${t}</span>`).join('');
      cartao.innerHTML = `<div class="tc-topo">${topo}</div>
        <b class="tc-titulo">${esc(o.titulo)}</b>
        <div class="tc-meta">${meta}</div>
        ${htmlPrazo(d.prazo)}
        ${d.acao ? `<div class="tc-acao">${esc(d.acao)}</div>` : ''}
        ${extra}
        ${htmlSeguir(o.titulo)}
        ${htmlProgresso(noPontoMs(), false)}`;
      if (nova) anunciar(o, d);
    }
    // Faixa no alto da tela quando chega uma ocorrência nova. Fica até a câmera chegar ao ponto (mais um
    // pouco, para dar tempo de ler); 20 s no máximo, para o caso de a câmera estar pausada.
    let fimFaixa = null;
    function anunciar(o, d) {
      faixa.className = `telao-faixa ${o.severidade}`;
      faixa.innerHTML = `<span class="ponto"></span><span class="tf-texto"><b>Nova ocorrência</b> · ${esc(d.gravidade)} · ${esc(o.titulo)}</span>`;
      faixa.hidden = false;
      esconderFaixa(20000);
    }
    function esconderFaixa(ms) {
      clearTimeout(fimFaixa);
      fimFaixa = setTimeout(() => { faixa.hidden = true; }, ms);
    }
    // O tempo no ponto só começa a contar quando a câmera chega (abrir grupos e voar leva alguns segundos).
    async function mostrarAlerta(o, meu) {
      naCidade = false;
      const nova = novas.has(o.id);
      const ms = noPontoMs();
      const chegou = await mapa.sobrevoar(o.id, {
        aoComecar: () => { if (meu === geracao) { desenharCartao(o, nova); focarPonto(o.id); } },
        espacoEsquerda,
      });
      if (!ativo || meu !== geracao) return; // saiu, pausou, ou outro passo (uma nova) passou na frente
      if (!chegou) return proximo(); // resolvida ou filtrada enquanto esperava: pula sem mostrar
      if (nova && !faixa.hidden) esconderFaixa(3000);
      const barra = cartao.querySelector('.telao-progresso');
      if (barra) barra.classList.add('andando');
      girar(GIRO_PONTO * (indice % 2 ? -1 : 1), ms);
      esperar(ms, proximo);
    }

    // ---- O roteiro andando ----
    // Próximo passo que tem o que mostrar: cena que não volta vazia, alerta ainda ativo e no mapa. Acabou
    // o roteiro, começa outra volta. As resolvidas entram antes, menos quando o próximo é uma nova.
    function proximo() {
      if (!ativo || pausado) return;
      pararTudo();
      soltarPonto();
      dadosPasso = null;
      const meu = geracao;
      const prox = roteiro[indice + 1];
      const vemNova = prox && prox.tipo === 'alerta' && novas.has(prox.id);
      pintar(null);
      atualizarRodape();
      if (resolvidas.length && !vemNova) return mostrarResolvidas(meu);
      for (let tentativa = 0; tentativa < 2; tentativa++) {
        while (++indice < roteiro.length) {
          const p = roteiro[indice];
          if (p.tipo === 'cena') {
            const c = cenaPorId(p.id);
            if (c && mostrarCena(c, meu)) return;
          } else {
            const o = buscar(p.id);
            if (o) return mostrarAlerta(o, meu);
          }
        }
        novaVolta();
      }
      mostrarCidade(meu);
    }
    // Ocorrência nova: entra logo depois do passo atual (sem repetir se já estava no roteiro) e a câmera
    // vai até ela na hora. Com a câmera pausada, só avisa; ela é a próxima ao retomar.
    function novidade(o) {
      if (!ativo || !o || !buscar(o.id)) return; // fora do filtro do mapa: não tem pino para mostrar
      if (!passaCriticas(o)) return atualizarRodape(); // "só críticas": não interrompe
      const resto = roteiro.slice(indice + 1).filter((p) => !(p.tipo === 'alerta' && p.id === o.id));
      roteiro = [...roteiro.slice(0, Math.max(0, indice + 1)), { tipo: 'alerta', id: o.id }, ...resto];
      novas.add(o.id);
      atualizarRodape();
      if (!pausado) return proximo();
      desenharCartao(o, true, '<div class="tc-pausa">▶ Retome a câmera para ir até ela</div>');
    }
    // Ocorrência resolvida (dentro do filtro): cartão rápido antes do passo seguinte. Se era o alerta na
    // tela, o cartão dele já não vale e o "Resolvida" entra na hora.
    function resolvida(o) {
      if (!ativo || !o || (noFiltro && !noFiltro(o)) || !passaCriticas(o)) return;
      if (!resolvidas.some((x) => x.id === o.id)) resolvidas.push(o);
      atualizarRodape();
      const atual = roteiro[indice];
      if (!pausado && atual && atual.tipo === 'alerta' && atual.id === o.id) proximo();
    }

    function marcarPausa() {
      btnPausar.setAttribute('aria-pressed', String(pausado));
      btnPausar.innerHTML = pausado
        ? '<i class="ti ti-player-play" aria-hidden="true"></i> Retomar câmera <kbd>Espaço</kbd>'
        : '<i class="ti ti-player-pause" aria-hidden="true"></i> Pausar câmera <kbd>Espaço</kbd>';
      el.classList.toggle('pausado', pausado);
    }
    function pausar(valor = !pausado) {
      if (!ativo || valor === pausado) return;
      pausado = valor;
      marcarPausa();
      if (pausado) {
        document.body.classList.remove('telao-ocioso');
        pararTudo();
        naCidade = false; // pausado, o mapa é de quem mexe: ao retomar, a câmera volta à cidade
        const barra = cartao.querySelector('.telao-progresso');
        if (barra) barra.classList.remove('andando');
      } else {
        // Retoma do passo seguinte (ou da nova que chegou durante a pausa).
        acordar();
        proximo();
      }
    }
    btnPausar.onclick = () => pausar();

    // Tempo em cada ponto: alterna entre os ritmos e fica salvo no navegador. Vale a partir do próximo passo.
    function marcarRitmo() {
      btnRitmo.innerHTML = `<i class="ti ti-clock-hour-4" aria-hidden="true"></i> ${config.ritmo} s por ponto`;
      btnRitmo.setAttribute('aria-label', `Tempo em cada ponto: ${config.ritmo} segundos. Trocar`);
    }
    btnRitmo.onclick = () => {
      const r = GC.RITMOS_TELAO;
      config.ritmo = r[(r.indexOf(config.ritmo) + 1) % r.length];
      marcarRitmo();
      gravar();
    };
    marcarRitmo();

    // Tema do mapa no próprio telão (claro ou noturno), como o botão do mapa. Vale na hora, fica salvo nos
    // ajustes do telão e não muda o tema guardado do painel.
    const btnTema = el.querySelector('.telao-tema');
    function marcarTema() {
      const escuro = config.mapaEscuro;
      btnTema.innerHTML = `<i class="ti ti-${escuro ? 'sun' : 'moon'}" aria-hidden="true"></i> ${escuro ? 'Mapa claro' : 'Mapa noturno'} <kbd>T</kbd>`;
      btnTema.setAttribute('aria-pressed', String(escuro));
      btnTema.title = escuro ? 'Trocar para o mapa claro' : 'Trocar para o mapa noturno (sala escura)';
    }
    const aplicarTema = () => { if (mapa.temaTemporario) mapa.temaTemporario(config.mapaEscuro ? 'escuro' : 'claro'); };
    function trocarTema() {
      config.mapaEscuro = !config.mapaEscuro;
      marcarTema();
      gravar();
      if (ativo) aplicarTema();
    }
    btnTema.onclick = trocarTema;
    marcarTema();

    const marcarRelogio = () => {
      el.querySelector('.telao-relogio').textContent = new Date().toLocaleString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
    };

    function entrar() {
      if (ativo) return;
      ativo = true;
      pausado = false;
      volta = 0;
      memorias = {};
      resolvidas = [];
      naCidade = false;
      marcarPausa();
      el.hidden = false;
      document.body.classList.add('telao-ativo');
      if (GC.fecharDashboard) GC.fecharDashboard();
      marcarMarca();
      marcarTema();
      aplicarTema();
      marcarRelogio();
      relogio = setInterval(marcarRelogio, 30000);
      const raiz = document.documentElement;
      if (raiz.requestFullscreen && !document.fullscreenElement) raiz.requestFullscreen().catch(() => {});
      if (aoMudar) aoMudar(true);
      novaVolta();
      fitaAtual = '';
      atualizarRodape();
      cartao.className = 'telao-cartao cidade';
      cartao.innerHTML = `<div class="tc-topo"><span class="tc-sev">Modo telão</span></div><b class="tc-titulo">${esc(GC.textoCidadeTelao(filaInfo))}</b>`;
      acordar();
      esperar(400, proximo); // depois do layout sem os painéis
    }
    function sair() {
      if (!ativo) return;
      ativo = false;
      pausado = false;
      pararTudo();
      resolvidas = [];
      clearInterval(relogio);
      clearTimeout(ocioso);
      clearTimeout(fimFaixa);
      faixa.hidden = true;
      document.body.classList.remove('telao-ocioso');
      el.hidden = true;
      document.body.classList.remove('telao-ativo');
      if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {});
      pintar(null);
      soltarPonto();
      if (mapa.temaTemporario) mapa.temaTemporario(null); // volta ao tema guardado do painel
      mapa.acender(null);
      mapa.visaoGeral();
      if (aoMudar) aoMudar(false);
    }
    // Marca no alto à esquerda: o logo da plataforma (o mesmo do menu, já personalizado) e o nome da cidade.
    function marcarMarca() {
      const logo = document.querySelector('.logo-atlas');
      const img = el.querySelector('.telao-marca img');
      img.hidden = !logo;
      if (logo) { img.src = logo.src; img.alt = logo.alt || ''; }
      const nome = document.getElementById('cidade-nome');
      el.querySelector('.telao-marca b').textContent = (nome && nome.textContent.trim()) || (GC.cidade && GC.cidade.nome) || '';
    }
    el.querySelector('.telao-sair').onclick = sair;
    document.addEventListener('keydown', (ev) => {
      if (!ativo) return;
      if (ev.key === 'Escape') { ev.stopImmediatePropagation(); sair(); return; }
      const a = document.activeElement;
      const digitando = ['INPUT', 'TEXTAREA', 'SELECT'].includes(a.tagName) || a.isContentEditable;
      // Espaço pausa/retoma (sem deixar o botão focado "clicar" de novo).
      if (ev.key === ' ' && !digitando && !ev.repeat) { ev.preventDefault(); ev.stopImmediatePropagation(); pausar(); }
      // T troca o mapa entre claro e noturno.
      if ((ev.key === 't' || ev.key === 'T') && !digitando && !ev.repeat && !ev.ctrlKey && !ev.metaKey && !ev.altKey) {
        ev.preventDefault(); ev.stopImmediatePropagation(); trocarTema();
      }
    }, true);
    // Saiu da tela cheia pelo navegador (F11, Esc do sistema): sai do telão também.
    document.addEventListener('fullscreenchange', () => { if (ativo && !document.fullscreenElement) sair(); });
    // Ajustes (a janela de antes de entrar): valem a partir da próxima volta e ficam salvos.
    function ajustar(novos) {
      Object.assign(config, GC.ajustesTelaoValidos(Object.assign({}, config, novos)));
      marcarRitmo();
      gravar();
    }
    const ajustes = () => Object.assign({}, config, { cenasDesligadas: config.cenasDesligadas.slice() });
    return { entrar, sair, novidade, resolvida, pausar, ajustar, ajustes, ativo: () => ativo, pausado: () => pausado };
  };
})(window.GC = window.GC || {});
