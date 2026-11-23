// Movimento de abertura (identidade-visual/movimento.md): ao abrir os Indicadores ou uma tela sobre o mapa,
// os cartões entram em cascata e os números contam de zero até o valor. Só observa o DOM: não muda
// widgets.js, app.js nem as telas. Nada disso roda para quem pediu menos movimento.
(function () {
  const GC = (window.GC = window.GC || {});

  const NUMEROS = [
    '.pulso b', '.w-num b', '.kpi-valor', '.sec-ind b', '.rel-numero b',
    '.ind-valor b', '.ind-ficha-valor b', '.ind-p b', '.w-frota-disp b', '.desemp-kpis b',
  ].join(',');
  // O que entra em cascata em cada lugar (no máximo 6 com atraso; o resto entra junto com o sexto).
  const CASCATA_DASH = '#widgets > .widget';
  const CASCATA_TELA = ':scope > *';
  const DURACAO = 700;

  const poucoMovimento = () => !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);

  // ---- números ----
  // Primeiro número do texto, no jeito brasileiro: "5.305 t", "4,3 h", "95%", "2 de 7", "1.748".
  const RE_NUM = /\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:,\d+)?/;
  function lerNumero(txt) {
    const m = RE_NUM.exec(txt);
    if (!m) return null;
    const bruto = m[0];
    const casas = bruto.includes(',') ? bruto.split(',')[1].length : 0;
    const milhar = bruto.includes('.');
    const valor = Number(bruto.replace(/\./g, '').replace(',', '.'));
    if (!Number.isFinite(valor)) return null;
    return { inicio: m.index, fim: m.index + bruto.length, valor, casas, milhar };
  }
  function formatar(v, { casas, milhar }) {
    return v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas, useGrouping: milhar });
  }
  function primeiroTextoComNumero(el) {
    const andar = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = andar.nextNode(); n; n = andar.nextNode()) if (RE_NUM.test(n.nodeValue)) return n;
    return null;
  }
  // Conta um elemento de 0 até o valor. Se o app reescrever o número no meio, para e deixa o novo.
  function contar(el, atraso) {
    const no = primeiroTextoComNumero(el);
    if (!no) return;
    const original = no.nodeValue;
    const num = lerNumero(original);
    if (!num || num.valor === 0) return;
    const antes = original.slice(0, num.inicio);
    const depois = original.slice(num.fim);
    let escrito = antes + formatar(0, num) + depois;
    no.nodeValue = escrito;
    const t0 = performance.now() + atraso;
    const passo = (agora) => {
      if (no.nodeValue !== escrito || !no.isConnected) return; // o app mudou o número: o dele vale
      const t = Math.min(1, Math.max(0, (agora - t0) / DURACAO));
      const e = 1 - Math.pow(1 - t, 3); // pousa devagar (--ease-sai)
      escrito = t >= 1 ? original : antes + formatar(num.valor * e, num) + depois;
      no.nodeValue = escrito;
      if (t < 1) requestAnimationFrame(passo);
    };
    requestAnimationFrame(passo);
    // Aba em segundo plano não roda requestAnimationFrame: o número termina no valor certo assim mesmo.
    setTimeout(() => { if (no.nodeValue === escrito) { escrito = original; no.nodeValue = original; } }, atraso + DURACAO + 300);
  }

  // ---- cascata ----
  function cascata(itens) {
    itens.forEach((el, i) => {
      el.style.setProperty('--i', String(Math.min(i, 6)));
      el.classList.remove('ga-cascata');
      void el.offsetWidth; // reinicia a animação se ela já tinha rodado
      el.classList.add('ga-cascata');
    });
    // Tira a classe depois: o cartão volta a poder animar (encaixe, "recém-chegado") sem herdar o atraso.
    setTimeout(() => itens.forEach((el) => el.classList.remove('ga-cascata')), 6 * 40 + 600);
  }

  function animar(raiz, seletorCascata) {
    if (!raiz || poucoMovimento()) return;
    const itens = [...raiz.querySelectorAll(seletorCascata)].filter((el) => el.offsetParent !== null);
    cascata(itens);
    raiz.querySelectorAll(NUMEROS).forEach((el) => {
      if (el.offsetParent === null) return;
      const card = itens.find((c) => c.contains(el));
      const i = card ? Math.min(itens.indexOf(card), 6) : 0;
      contar(el, 120 + i * 40);
    });
  }
  GC.movimento = { animar, contar, lerNumero };

  function ligar() {
    const corpo = document.body;
    // Indicadores: quando a gaveta sobe (body.dash-aberto) e quando a aba muda.
    let dashAberto = corpo.classList.contains('dash-aberto');
    new MutationObserver(() => {
      const agora = corpo.classList.contains('dash-aberto');
      if (agora && !dashAberto) setTimeout(() => animar(document.getElementById('dashboard'), `${CASCATA_DASH}, .ind-cartoes > .ind-cartao`), 60);
      dashAberto = agora;
    }).observe(corpo, { attributes: true, attributeFilter: ['class'] });

    const dash = document.getElementById('dashboard');
    if (dash) {
      ['widgets', 'tela-indicadores'].forEach((id) => {
        const el = document.getElementById(id);
        if (!el) return;
        new MutationObserver(() => {
          if (!el.hidden && corpo.classList.contains('dash-aberto')) setTimeout(() => animar(el, id === 'widgets' ? CASCATA_DASH : '.ind-cartoes > .ind-cartao'), 30);
        }).observe(el, { attributes: true, attributeFilter: ['hidden'] });
      });
    }

    // Telas sobre o mapa: quando uma tela aparece (js/app/telas.js tira o hidden e logo depois desenha o
    // conteúdo, no mesmo passo), entra a cascata. Vale com e sem View Transitions.
    document.querySelectorAll('#sobre > .tela').forEach((tela) => {
      let visivel = !tela.hidden;
      new MutationObserver(() => {
        const agora = !tela.hidden;
        if (agora && !visivel) animar(tela, CASCATA_TELA);
        visivel = agora;
      }).observe(tela, { attributes: true, attributeFilter: ['hidden'] });
    });

    ligarBrilho();
  }

  // ---- Brilho que segue o mouse nos cartões (só com mouse; o CSS em css/premium.css usa --mx e --my) ----
  const COM_BRILHO = '.widget, .ind-cartao, .rel-numero, .alr-kpi';
  function ligarBrilho() {
    if (!(window.matchMedia && matchMedia('(hover: hover) and (pointer: fine)').matches)) return;
    let pendente = null;
    let ultimo = null;
    document.addEventListener('pointermove', (e) => {
      pendente = e;
      if (ultimo) return;
      ultimo = requestAnimationFrame(() => {
        ultimo = null;
        const ev = pendente;
        const alvo = ev.target && ev.target.closest ? ev.target.closest(COM_BRILHO) : null;
        if (!alvo) return;
        const r = alvo.getBoundingClientRect();
        alvo.style.setProperty('--mx', `${ev.clientX - r.left}px`);
        alvo.style.setProperty('--my', `${ev.clientY - r.top}px`);
      });
    }, { passive: true });
  }
  if (typeof document !== 'undefined' && document.body) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ligar);
    else ligar();
  }
})();
