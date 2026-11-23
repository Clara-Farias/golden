(function (GC) {
  // Janela "No site da Prefeitura", aberta da gaveta Widgets (js/widgets.js, botão data-incorporar).
  // O conteúdo é a própria galeria do embed.html num iframe (?painel=1): a mesma prévia e o mesmo código que
  // o site vai receber, sem misturar o CSS do embed com o do painel. Copiar o código vira auditoria (widget_site).
  const ic = (n) => (GC.icone ? GC.icone(n) : '');
  let dlg = null;
  let voltarPara = null;

  function montar() {
    dlg = document.createElement('dialog');
    dlg.className = 'dlg-incorporar';
    dlg.setAttribute('aria-labelledby', 'dlg-incorporar-titulo');
    dlg.innerHTML = `<header>
        <div><h2 id="dlg-incorporar-titulo">${ic('world-www')} Widgets no site da Prefeitura</h2>
        <p>Ajuste cada widget, confira a prévia e copie o código para colar no site. Só aparece o que pode ser público.</p></div>
        <a class="btn-sec" href="embed.html" target="_blank" rel="noopener">${ic('external-link')} Abrir em nova aba</a>
        <button type="button" class="gaveta-x" data-fechar-incorporar aria-label="Fechar">✕</button>
      </header>
      <iframe title="Widgets para o site da Prefeitura" allow="clipboard-write"></iframe>`;
    document.body.appendChild(dlg);
    dlg.addEventListener('click', (e) => {
      if (e.target.closest('[data-fechar-incorporar]') || e.target === dlg) fechar();
    });
    // O Esc fecha só a janela; o Esc geral do painel (fecha a gaveta) não deve receber o mesmo toque.
    dlg.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); fechar(); } });
    dlg.addEventListener('close', () => { if (voltarPara && voltarPara.isConnected) voltarPara.focus(); });
    window.addEventListener('message', (e) => {
      const frame = dlg.querySelector('iframe');
      if (e.origin !== window.location.origin || !e.data || e.source !== frame.contentWindow) return;
      if (e.data.tipo === 'vd-embed-fechar') fechar();
      if (e.data.tipo === 'vd-embed-copiado' && GC.auditar) {
        const w = (GC.conteudoPublico || {})[e.data.id];
        GC.auditar('widget_site', { alvo: w ? w.nome : e.data.id, detalhe: e.data.url ? `Endereço: ${e.data.url}` : undefined });
      }
    });
  }

  function fechar() { if (dlg && dlg.open) dlg.close(); }

  // id: o widget para já abrir em foco (null = a galeria do começo).
  GC.abrirIncorporar = function (id) {
    if (GC.podeIncorporarWidgets && !GC.podeIncorporarWidgets()) return;
    if (!dlg) montar();
    voltarPara = document.activeElement;
    const params = new URLSearchParams({ painel: '1' });
    const cidade = new URLSearchParams(window.location.search).get('cidade');
    if (cidade) params.set('cidade', cidade);
    const src = `embed.html?${params}${id ? `#${encodeURIComponent(id)}` : ''}`;
    const frame = dlg.querySelector('iframe');
    // Só o # mudou: a galeria ouve o hashchange e vai ao widget. Mesmo endereço: recarrega para voltar ao começo.
    if (frame.getAttribute('src') === src) frame.contentWindow.location.reload();
    else frame.setAttribute('src', src);
    if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
    dlg.querySelector('[data-fechar-incorporar]').focus();
  };
})(window.GC = window.GC || {});
