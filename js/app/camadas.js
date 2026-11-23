(function (GC) {
  // Painel Camadas do mapa: os interruptores de cada camada fixa (leitos, risco, obras, escolas, frota, coleta,
  // farmácias, B.O.s, conquistas, vigilância, trânsito, habitação, prédios, economia, custo e orçamento, eventos), o contador do botão, "Limpar todas", o recorte do perfil e a contagem de cada uma.
  // Camada nova: um item em CAMADAS (o interruptor, o liga/desliga e o foco do mapa) e o <input> no index.html.
  GC.criarAppCamadas = function (app) {
    const { $, podeCamada } = app;

    // nome (o que a IA e a busca pedem) → [interruptor, liga/desliga no mapa, foco num ponto, chave da contagem]
    const CAMADAS = {
      leitos: ['toggle-leitos', 'alternarLeitos', 'focarLeito', 'leitos'],
      risco: ['toggle-risco', 'alternarRisco', 'focarRisco', 'risco'],
      obras: ['toggle-obras', 'alternarObras', 'focarObra', 'obras'],
      escolas: ['toggle-escolas', 'alternarEscolas', 'focarEscola', 'escolas'],
      frota: ['toggle-frota', 'alternarFrota', 'focarFrota', 'frota'],
      coleta: ['toggle-coleta', 'alternarColeta', 'focarColeta', 'coleta'],
      farmacias: ['toggle-farmacias', 'alternarFarmacias', 'focarFarmacia', 'farmacias'],
      'calor-bo': ['toggle-calor-bo', 'alternarCalorBO', null, 'calorBo'],
      conquistas: ['toggle-conquistas', 'alternarConquistas', 'focarConquista', 'conquistas'],
      vigilancia: ['toggle-vigilancia', 'alternarVigilancia', 'focarVigilancia', 'vigilancia'],
      transito: ['toggle-transito', 'alternarTransito', 'focarTransito', 'transito'],
      habitacao: ['toggle-habitacao', 'alternarHabitacao', 'focarHabitacao', 'habitacao'],
      predios: ['toggle-predios', 'alternarPredios', 'focarPredio', 'predios'],
      economia: ['toggle-economia', 'alternarEconomia', 'focarEconomia', 'economia'],
      orcamento: ['toggle-orcamento', 'alternarOrcamento', 'focarOrcamento', 'orcamento'],
      eventos: ['toggle-eventos', 'alternarEventos', 'focarEvento', 'eventos'],
    };

    const nomeDoToggle = {}; // id do interruptor → nome da camada
    Object.keys(CAMADAS).forEach((nome) => { nomeDoToggle[CAMADAS[nome][0]] = nome; });
    const grupos = []; // { btn, inputs(), nome }: montados mais abaixo

    // Contador do botão Camadas: quantas camadas extras estão ligadas (há quem as ligue por código, sem evento).
    function marcar() {
      const n = document.querySelectorAll('#painel-camadas input:checked').length;
      const c = $('camadas-contador');
      c.textContent = n;
      c.hidden = !n;
      $('camadas-limpar').disabled = !n;
      $('camadas-ligadas').textContent = n ? `${n} ${n > 1 ? 'camadas ligadas' : 'camada ligada'}` : 'Nenhuma camada ligada';
      marcarGrupos();
    }
    // Botão de cada grupo: "Ligar o grupo" ou, com todas as camadas dele ligadas, "Desligar".
    function marcarGrupos() {
      grupos.forEach(({ btn, inputs, nome }) => {
        const lista = inputs();
        const todas = lista.length > 0 && lista.every((i) => i.checked);
        btn.textContent = todas ? 'Desligar' : 'Ligar o grupo';
        btn.setAttribute('aria-label', `${todas ? 'Desligar' : 'Ligar'} o grupo ${nome}`);
      });
    }

    // Liga uma camada fixa do mapa (o controle acompanha) e, com id, abre o ponto dela.
    // As conquistas ficam de fora: elas não entram por aqui (só pelo Resumo da semana).
    // manter: vem de um widget; não tira a camada da IA nem o filtro de setor das obras.
    function abrir(nome, id, { manter = false } = {}) {
      const c = nome !== 'conquistas' && CAMADAS[nome];
      if (!c || !podeCamada(c[0])) return; // camada fora do perfil (ex.: B.O.s para a Saúde)
      const [toggle, ligar, focarNela] = c;
      const mapa = app.mapa;
      if (!manter) mapa.limparCamada(); // o destaque/calor da resposta anterior não fica por baixo
      if ($(toggle)) $(toggle).checked = true;
      mapa[ligar](true);
      if (nome === 'obras' && !manter) mapa.filtrarObras(null);
      app.noPainel(() => { app.subirAoMapa(); if (id && focarNela) mapa[focarNela](id); else mapa.visaoGeral(); });
    }

    // Cada interruptor liga/desliga a sua camada no mapa.
    Object.values(CAMADAS).forEach(([toggle, ligar]) => {
      $(toggle).addEventListener('change', (ev) => app.mapa[ligar](ev.target.checked));
    });
    $('painel-camadas').addEventListener('change', marcar);
    // "Limpar todas": desliga cada camada ligada pelo mesmo caminho do clique (o evento change chama o mapa).
    $('camadas-limpar').addEventListener('click', () => {
      document.querySelectorAll('#painel-camadas input:checked').forEach((i) => {
        i.checked = false;
        i.dispatchEvent(new Event('change', { bubbles: true }));
      });
    });
    // "Só o que pede atenção": a preferência fica no navegador (ligada de fábrica). O mapa decide quando vale
    // (2 ou mais camadas, GC.mapaLogica.soAtencaoAtivo) e a legenda avisa, com "Mostrar tudo" para desligar.
    const CHAVE_ATENCAO = 'gc.mapa.soAtencao';
    let soAtencao = true;
    try { soAtencao = localStorage.getItem(CHAVE_ATENCAO) !== 'nao'; } catch (e) { /* sem armazenamento: ligada */ }
    function preferirAtencao(v) {
      soAtencao = !!v;
      try { localStorage.setItem(CHAVE_ATENCAO, soAtencao ? 'sim' : 'nao'); } catch (e) { /* sem armazenamento */ }
      $('camadas-so-atencao').setAttribute('aria-checked', String(soAtencao));
      app.mapa.preferirSoAtencao(soAtencao);
    }
    $('camadas-so-atencao').setAttribute('aria-checked', String(soAtencao));
    $('camadas-so-atencao').addEventListener('click', () => preferirAtencao(!soAtencao));
    $('mapa-legenda-fixa').addEventListener('click', (ev) => { if (ev.target.closest('[data-mostrar-tudo]')) preferirAtencao(false); });
    app.mapa.preferirSoAtencao(soAtencao);
    // Fundo "Ruas": só o desenho das ruas, claro e sem nomes, por baixo dos bairros. Preferência do navegador
    // (desligada de fábrica: o fundo liso continua o padrão). Não é camada: fica fora do contador e do "Limpar todas".
    const CHAVE_FUNDO = 'gc.mapa.fundo';
    let ruas = false;
    try { ruas = localStorage.getItem(CHAVE_FUNDO) === 'ruas'; } catch (e) { /* sem armazenamento: liso */ }
    function preferirRuas(v) {
      ruas = !!v;
      try { localStorage.setItem(CHAVE_FUNDO, ruas ? 'ruas' : 'liso'); } catch (e) { /* sem armazenamento */ }
      $('camadas-fundo-ruas').setAttribute('aria-checked', String(ruas));
      app.mapa.mostrarRuas(ruas);
    }
    $('camadas-fundo-ruas').setAttribute('aria-checked', String(ruas));
    $('camadas-fundo-ruas').addEventListener('click', () => preferirRuas(!ruas));
    app.mapa.mostrarRuas(ruas);
    // Camadas fora do perfil somem do painel (gestor do setor: públicas + as da pasta).
    document.querySelectorAll('#painel-camadas input[type="checkbox"]').forEach((i) => {
      if (podeCamada(i.id)) return;
      i.checked = false;
      const rotulo = i.closest('label');
      if (rotulo) { rotulo.hidden = true; rotulo.style.display = 'none'; } // .toggle tem display próprio
    });
    // Contagem em cada camada: quantas pedem atenção (em vermelho) ou, sem nenhuma, o total.
    const resumoCamadas = GC.mapaLogica.resumoCamadas();
    Object.values(CAMADAS).forEach(([id, , , chave]) => {
      const c = resumoCamadas[chave];
      const rotulo = $(id) && $(id).closest('label');
      if (!c || !rotulo || rotulo.querySelector('.camada-n')) return;
      const n = document.createElement('small');
      n.className = `camada-n${c.alerta ? ' alerta' : ''}`;
      n.textContent = c.alerta ? `${c.alerta} ${c.rotulo[c.alerta > 1 ? 1 : 0]}` : c.total.toLocaleString('pt-BR');
      n.title = n.textContent; // contagem longa se encurta (css/mapa-camadas.css): o texto inteiro fica na dica
      rotulo.appendChild(n);
    });

    // Grupos temáticos (GC.mapaLogica.GRUPOS_CAMADAS): os rótulos mudam de lugar no painel, com título e um botão
    // que liga ou desliga o grupo todo pelo mesmo caminho do clique (o evento change chama o mapa).
    const lista = $('camadas-lista');
    GC.mapaLogica.GRUPOS_CAMADAS.forEach((g) => {
      const rotulos = g.camadas.map((nome) => CAMADAS[nome] && $(CAMADAS[nome][0])).filter(Boolean)
        .map((i) => i.closest('label')).filter(Boolean);
      if (!rotulos.length) return;
      const caixa = document.createElement('div');
      caixa.className = 'camadas-grupo';
      caixa.setAttribute('role', 'group');
      caixa.setAttribute('aria-label', g.nome);
      caixa.innerHTML = `<div class="camadas-grupo-cab"><span class="camadas-grupo-nome">${GC.escaparHtml(g.nome)}</span><button type="button" class="camadas-grupo-btn"></button></div>`;
      rotulos.forEach((r) => caixa.appendChild(r));
      lista.appendChild(caixa);
      caixa.hidden = rotulos.every((r) => r.hidden); // fora do perfil: o grupo inteiro some
      const inputs = () => rotulos.filter((r) => !r.hidden).map((r) => r.querySelector('input'));
      const btn = caixa.querySelector('.camadas-grupo-btn');
      btn.addEventListener('click', () => {
        const ligar = !inputs().every((i) => i.checked);
        inputs().forEach((i) => {
          if (i.checked === ligar) return;
          i.checked = ligar;
          i.dispatchEvent(new Event('change', { bubbles: true }));
        });
      });
      grupos.push({ btn, inputs, nome: g.nome });
    });
    marcarGrupos();

    // Destacar uma camada: passar o mouse (ou o foco) numa camada ligada, no painel ou na legenda, esmaece as
    // outras no mapa (js/mapa/varias-camadas.js). O olho na legenda fixa o destaque (no toque não há "passar o
    // mouse"); outro clique solta.
    let fixada = null;
    let ultimo;
    const destacar = (nome) => {
      const alvo = nome || fixada;
      if (alvo === ultimo) return;
      ultimo = alvo;
      app.mapa.destacarCamada(alvo);
    };
    const doPainel = (el) => {
      const r = el.closest && el.closest('label.toggle');
      const i = r && r.querySelector('input');
      return i && i.checked ? nomeDoToggle[i.id] || null : null;
    };
    const painel = $('painel-camadas');
    painel.addEventListener('mouseover', (ev) => destacar(doPainel(ev.target)));
    painel.addEventListener('mouseleave', () => destacar(null));
    painel.addEventListener('focusin', (ev) => destacar(doPainel(ev.target)));
    painel.addEventListener('focusout', () => destacar(null));
    painel.addEventListener('change', () => { ultimo = undefined; destacar(null); });
    const legendaFixa = $('mapa-legenda-fixa');
    const daLegenda = (el) => { const s = el.closest && el.closest('[data-camada-leg]'); return s ? s.dataset.camadaLeg : null; };
    legendaFixa.addEventListener('mouseover', (ev) => destacar(daLegenda(ev.target)));
    legendaFixa.addEventListener('mouseleave', () => destacar(null));
    legendaFixa.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-fixar-camada]');
      if (!b) return;
      ev.preventDefault(); // dentro do <summary>: não abre/fecha o detalhe
      fixada = fixada === b.dataset.fixarCamada ? null : b.dataset.fixarCamada;
      legendaFixa.querySelectorAll('[data-fixar-camada]').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.fixarCamada === fixada)));
      ultimo = undefined;
      destacar(null);
    });

    $('btn-limpar-camada').addEventListener('click', () => app.mapa.limparEVoltar());

    // Visualização: quais camadas estão ligadas (nomes de CAMADAS) e ligar exatamente as de uma lista.
    // Só mexe no que muda (religar uma camada reabriria pinos e popups à toa).
    const estado = () => Object.keys(CAMADAS).filter((nome) => { const i = $(CAMADAS[nome][0]); return i && i.checked; });
    function aplicar(lista) {
      Object.keys(CAMADAS).forEach((nome) => {
        const [toggle, ligar] = CAMADAS[nome];
        const i = $(toggle);
        const quer = lista.includes(nome) && podeCamada(toggle);
        if (!i || i.checked === quer) return;
        i.checked = quer;
        app.mapa[ligar](quer);
      });
      marcar();
    }

    return { marcar, abrir, estado, aplicar };
  };
})(window.GC = window.GC || {});
