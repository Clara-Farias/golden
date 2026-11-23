(function (GC) {
  // Telão · ajustes antes de entrar: tempo em cada ponto, quais cenas entram entre os alertas e se a fila
  // mostra só as críticas. Abre ao clicar em "Modo telão"; o que for escolhido fica salvo no navegador
  // (pelo telao.ajustar) e já vem marcado da próxima vez. Enter entra, Esc fecha sem entrar.
  // ajustes() → { ritmo, cenasDesligadas, soCriticas }; aoEntrar(novos) grava e entra no telão.
  GC.criarAjustesTelao = function ({ ajustes, aoEntrar }) {
    const esc = (t) => GC.escaparHtml(String(t));
    const dlg = document.createElement('dialog');
    dlg.className = 'w-modal telao-ajustes';
    dlg.setAttribute('aria-labelledby', 'telao-ajustes-titulo');
    document.body.appendChild(dlg);

    function desenhar() {
      const a = ajustes();
      const cenas = GC.cenasTelao.slice().sort((x, y) => x.ordem - y.ordem);
      const ritmos = GC.RITMOS_TELAO.map((s) => `<label class="ta-chip"><input type="radio" name="ritmo" value="${s}"${s === a.ritmo ? ' checked' : ''}><span>${s} s</span></label>`).join('');
      const listaCenas = cenas.map((c) => `<li><label class="ta-cena${c.fixa ? ' fixa' : ''}">
          <input type="checkbox" name="cena" value="${esc(c.id)}"${c.fixa || !a.cenasDesligadas.includes(c.id) ? ' checked' : ''}${c.fixa ? ' disabled' : ''}>
          <span><b>${esc(c.nome)}</b>${c.fixa ? ' <small class="ta-sempre">sempre</small>' : ''}<small>${esc(c.descricao || '')}</small></span></label></li>`).join('');
      dlg.innerHTML = `<form method="dialog" class="ta-form">
        <header class="w-modal-cab"><h2 id="telao-ajustes-titulo"><i class="ti ti-device-tv" aria-hidden="true"></i> Modo telão</h2>
          <button type="button" class="gaveta-x" data-fechar aria-label="Fechar sem entrar"><i class="ti ti-x" aria-hidden="true"></i></button></header>
        <div class="w-modal-corpo">
          <fieldset class="ta-grupo"><legend>Tempo em cada ponto</legend><div class="ta-chips">${ritmos}</div>
            <p class="ta-dica">As cenas ficam 2 s a mais que os alertas, porque têm mais para ler.</p></fieldset>
          <fieldset class="ta-grupo"><legend>Cenas</legend><ul class="ta-cenas">${listaCenas}</ul></fieldset>
          <fieldset class="ta-grupo"><legend>Alertas</legend>
            <label class="ta-cena"><input type="checkbox" name="soCriticas"${a.soCriticas ? ' checked' : ''}>
              <span><b>Só ocorrências críticas</b><small>Vale para a fila de alertas, o rodapé e os avisos de resolvida. Os números da cidade continuam completos.</small></span></label></fieldset>
          <fieldset class="ta-grupo"><legend>Tela</legend>
            <label class="ta-cena"><input type="checkbox" name="mapaEscuro"${a.mapaEscuro ? ' checked' : ''}>
              <span><b>Mapa noturno</b><small>Fundo escuro, que não ofusca na sala e destaca os pinos. Ao sair do telão, o painel volta ao tema de antes.</small></span></label></fieldset>
        </div>
        <footer class="ta-rodape"><span class="ta-salvo">Os ajustes ficam salvos neste navegador.</span>
          <button type="button" class="btn-sec" data-fechar>Cancelar</button>
          <button type="submit" class="btn-primario" autofocus><i class="ti ti-player-play" aria-hidden="true"></i> Entrar no telão</button></footer>
      </form>`;
    }
    function ler() {
      const f = dlg.querySelector('form');
      return {
        ritmo: Number((f.querySelector('input[name="ritmo"]:checked') || {}).value) || ajustes().ritmo,
        cenasDesligadas: [...f.querySelectorAll('input[name="cena"]:not(:checked):not(:disabled)')].map((i) => i.value),
        soCriticas: f.querySelector('input[name="soCriticas"]').checked,
        mapaEscuro: f.querySelector('input[name="mapaEscuro"]').checked,
      };
    }
    dlg.addEventListener('click', (ev) => {
      if (ev.target === dlg || ev.target.closest('[data-fechar]')) dlg.close(); // clique fora ou "Cancelar"
    });
    dlg.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const novos = ler();
      dlg.close();
      aoEntrar(novos); // ainda dentro do clique/Enter: o navegador aceita a tela cheia
    });
    return {
      abrir() {
        desenhar();
        dlg.showModal();
      },
      aberto: () => dlg.open,
    };
  };
})(window.GC = window.GC || {});
