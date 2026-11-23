(function (GC) {
  // Falar com a Maia (workshop de 18/11: "conversão de voz em texto para facilitar a interação por meio da
  // assistente"). Um botão de microfone ao lado do campo de cada conversa com a Maia: painel (#chat-form), Portal do
  // Cidadão (#p-maia-form) e portal do servidor (#sv-maia-form). Usa o reconhecimento de fala do próprio navegador
  // (Web Speech API, pt-BR): o texto aparece no campo enquanto a pessoa fala e é enviado quando ela para.
  // Navegador sem reconhecimento (Firefox, por exemplo): o botão não aparece. Nada é gravado nem sai do aparelho
  // pelo painel; o reconhecimento é o do navegador.
  const Reconhecimento = window.SpeechRecognition || window.webkitSpeechRecognition;
  GC.vozDisponivel = !!Reconhecimento;
  const FORMS = ['#chat-form', '#p-maia-form', '#sv-maia-form'];

  function ligar(form) {
    if (!form || form.querySelector('.btn-voz')) return;
    const campo = form.querySelector('input[type="text"], input:not([type]), textarea');
    if (!campo) return;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn-voz';
    b.title = 'Falar com a Maia (a fala vira texto)';
    b.setAttribute('aria-label', 'Falar com a Maia');
    b.setAttribute('aria-pressed', 'false');
    b.innerHTML = '<i class="ti ti-microphone" aria-hidden="true"></i>';
    const enviar = form.querySelector('button[type="submit"]');
    form.insertBefore(b, enviar || null);

    let rec = null;
    let antes = '';
    function parar() { if (rec) { try { rec.stop(); } catch (e) { /* já parou */ } } }
    function estado(ouvindo) {
      b.classList.toggle('ouvindo', ouvindo);
      b.setAttribute('aria-pressed', String(ouvindo));
      b.innerHTML = `<i class="ti ti-${ouvindo ? 'player-stop' : 'microphone'}" aria-hidden="true"></i>`;
      b.title = ouvindo ? 'Parar de ouvir' : 'Falar com a Maia (a fala vira texto)';
      campo.placeholder = ouvindo ? 'Ouvindo… pode falar' : (campo.dataset.placeholderVoz || campo.placeholder);
    }
    b.addEventListener('click', () => {
      if (rec) { parar(); return; }
      if (!Reconhecimento) return;
      campo.dataset.placeholderVoz = campo.placeholder;
      antes = campo.value ? `${campo.value.trim()} ` : '';
      rec = new Reconhecimento();
      rec.lang = 'pt-BR';
      rec.interimResults = true;
      rec.continuous = false;
      let final = '';
      rec.onresult = (ev) => {
        let parcial = '';
        for (let i = ev.resultIndex; i < ev.results.length; i += 1) {
          if (ev.results[i].isFinal) final += ev.results[i][0].transcript;
          else parcial += ev.results[i][0].transcript;
        }
        campo.value = (antes + final + parcial).trim();
      };
      rec.onerror = (ev) => {
        if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed') campo.placeholder = 'Libere o microfone no navegador para falar com a Maia';
      };
      rec.onend = () => {
        rec = null;
        estado(false);
        // Falou alguma coisa: envia como se a pessoa tivesse apertado Enter.
        if (final.trim()) {
          if (form.requestSubmit) form.requestSubmit(); else form.dispatchEvent(new Event('submit', { cancelable: true }));
        }
      };
      estado(true);
      try { rec.start(); } catch (e) { rec = null; estado(false); }
    });
  }

  // ---- A Maia responde em voz (pauta do Paulo Fiuza, item 2) ----
  // Um botão de alto-falante ao lado do microfone liga e desliga. Ligado, cada resposta nova da Maia é lida em voz
  // alta (Web Speech, voz em português do próprio aparelho), quando a resposta termina de aparecer. A escolha fica no
  // aparelho (gc.maia.voz). Só o texto da resposta é lido: botões, gráficos e o nome "Maia" ficam de fora.
  const fala = typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance === 'function';
  const CONVERSAS = [
    { form: '#chat-form', log: '#chat-mensagens', msg: '.msg.ia', texto: (m) => m },
    { form: '#p-maia-form', log: '#p-maia-log', msg: '.pm-dela', texto: (m) => m.querySelector('.pm-balao') || m },
    { form: '#sv-maia-form', log: '#sv-maia-log', msg: '.sv-maia-msg.dela', texto: (m) => m.querySelector('.sv-maia-balao') || m },
  ];
  const CHAVE_FALA = 'gc.maia.voz';
  let falaLigada = (() => { try { return localStorage.getItem(CHAVE_FALA) === '1'; } catch (e) { return false; } })();
  const lidas = new WeakSet();
  function textoLimpo(el) {
    const c = el.cloneNode(true);
    c.querySelectorAll('button, .autor, canvas, svg, .maia-rosto, .pm-mapa, .msg-acoes, .chat-grafico, table, .sv-maia-opcoes').forEach((x) => x.remove());
    return c.textContent.replace(/\s+/g, ' ').trim().slice(0, 700);
  }
  function falar(t) {
    if (!fala || !t) return;
    const u = new SpeechSynthesisUtterance(t);
    u.lang = 'pt-BR';
    u.rate = 1;
    const voz = window.speechSynthesis.getVoices().find((v) => /^pt(-|_)BR/i.test(v.lang));
    if (voz) u.voice = voz;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  }
  function marcarBotoes() {
    document.querySelectorAll('.btn-ouvir').forEach((b) => {
      b.setAttribute('aria-pressed', String(falaLigada));
      b.title = falaLigada ? 'A Maia está lendo as respostas em voz alta. Clique para desligar.' : 'Ouvir as respostas da Maia em voz alta';
      b.innerHTML = `<i class="ti ti-${falaLigada ? 'volume' : 'volume-off'}" aria-hidden="true"></i>`;
    });
  }
  function ligarFala(cfg) {
    const form = document.querySelector(cfg.form);
    const log = document.querySelector(cfg.log);
    if (!fala || !form || !log || form.querySelector('.btn-ouvir')) return;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn-voz btn-ouvir';
    b.setAttribute('aria-label', 'Ouvir as respostas da Maia em voz alta');
    const antesDe = form.querySelector('.btn-voz') || form.querySelector('button[type="submit"]');
    form.insertBefore(b, antesDe || null);
    b.addEventListener('click', () => {
      falaLigada = !falaLigada;
      try { localStorage.setItem(CHAVE_FALA, falaLigada ? '1' : '0'); } catch (e) { /* vale até recarregar */ }
      if (!falaLigada) window.speechSynthesis.cancel();
      marcarBotoes();
      // Ligou: lê a última resposta, para a pessoa ouvir como fica.
      if (falaLigada) { const ult = [...log.querySelectorAll(cfg.msg)].pop(); if (ult) { lidas.add(ult); falar(textoLimpo(cfg.texto(ult))); } }
    });
    // As respostas que já estavam na tela (conversa restaurada) não são lidas.
    log.querySelectorAll(cfg.msg).forEach((m) => lidas.add(m));
    let espera = null;
    new MutationObserver(() => {
      clearTimeout(espera);
      // Espera a resposta terminar de aparecer (a Maia escreve aos poucos).
      espera = setTimeout(() => {
        const novas = [...log.querySelectorAll(cfg.msg)].filter((m) => !lidas.has(m) && !m.classList.contains('msg-restaurada'));
        novas.forEach((m) => lidas.add(m));
        if (falaLigada && novas.length) falar(textoLimpo(cfg.texto(novas[novas.length - 1])));
      }, 900);
    }).observe(log, { childList: true, subtree: true, characterData: true });
    marcarBotoes();
  }
  GC.maiaVoz = { ligada: () => falaLigada, falar, textoLimpo };

  function iniciar() {
    if (GC.vozDisponivel) FORMS.forEach((s) => ligar(document.querySelector(s)));
    CONVERSAS.forEach(ligarFala);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})(window.GC = window.GC || {});
