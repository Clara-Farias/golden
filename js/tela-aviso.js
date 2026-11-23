(function (GC) {
  // Tela de aviso sobre o mapa: "Acesso restrito" (rota fora do perfil sem equivalente, GC.motivoNegado em
  // js/perfil.js) e "Página não encontrada" (rota que não existe, js/rotas.js). O endereço pedido fica na barra.
  const esc = (t) => GC.escaparHtml(t);

  // opcoes: { aoIr(rota), aoBuscar() }
  // Grafismo (manual, Estado vazio): sem dado na tela, curvas de nível esmaecidas saindo pela borda e, quando a
  // página não existe, o alvo vazio (o lugar foi marcado, mas não há nada nele).
  function fundo(info) {
    const g = GC.grafismo;
    if (!g) return '';
    const w = 720; const h = 420;
    const corpo = g.curvas({ w, h, cor: 'currentColor', op: 0.16, semente: g.semente(info.caminho || info.tela || info.tipo), esp: 1 })
      + (info.tipo === 'negado' ? '' : g.alvo(w * 0.8, h * 0.26, 6, 'currentColor', 0.5));
    return g.fundo(corpo, w, h, 'av-grafismo');
  }

  GC.criarTelaAviso = function (el, opcoes) {
    function mostrar(info) {
      if (info.tipo === 'negado') {
        el.innerHTML = `
          <div class="av-caixa">${fundo(info)}
            <i class="ti ti-lock-access av-icone av-icone-negado" aria-hidden="true"></i>
            <h2 tabindex="-1">Acesso restrito</h2>
            <p>Você tentou abrir <b>${esc(info.tela)}</b>. Essa tela é só para ${esc(info.quem)}, e o seu perfil (${esc(info.perfilRotulo)}) não inclui ela.</p>
            <p class="av-dica">Se precisa desse acesso para o seu trabalho, peça ao Gabinete do Prefeito. A tentativa fica registrada na auditoria.</p>
            <div class="av-botoes">
              ${info.inicio ? `<button type="button" class="btn-primario" data-av="inicio"><i class="ti ti-building" aria-hidden="true"></i> Ir para a minha secretaria</button>` : ''}
              <button type="button" class="btn-sec" data-av="permissoes"><i class="ti ti-shield-check" aria-hidden="true"></i> Ver o que o meu perfil pode</button>
              <button type="button" class="btn-sec" data-av="mapa"><i class="ti ti-map-2" aria-hidden="true"></i> Voltar ao mapa</button>
            </div>
          </div>`;
      } else {
        el.innerHTML = `
          <div class="av-caixa">${fundo(info)}
            <i class="ti ti-map-question av-icone" aria-hidden="true"></i>
            <h2 tabindex="-1">Página não encontrada</h2>
            <p>Não existe tela no endereço <code>${esc(info.caminho || '')}</code>. O link pode estar incompleto ou a tela mudou de lugar.</p>
            <div class="av-botoes">
              <button type="button" class="btn-primario" data-av="mapa"><i class="ti ti-map-2" aria-hidden="true"></i> Voltar ao mapa</button>
              <button type="button" class="btn-sec" data-av="buscar"><i class="ti ti-search" aria-hidden="true"></i> Buscar no painel</button>
            </div>
          </div>`;
      }
      const acoes = {
        inicio: () => opcoes.aoIr(info.inicio),
        // Abre o próprio perfil de acesso (o que ele pode, permissão a permissão).
        permissoes: () => { const x = GC.papelDe ? GC.papelDe(GC.perfil) : null; opcoes.aoIr({ tela: 'usuarios', aba: 'perfis', perfil: x && x.pagina === 'painel' ? x.id : null }); },
        mapa: () => opcoes.aoIr({ tela: 'painel' }),
        buscar: () => opcoes.aoBuscar(),
      };
      el.querySelectorAll('[data-av]').forEach((b) => { b.onclick = acoes[b.dataset.av]; });
      el.querySelector('h2').focus({ preventScroll: true });
    }
    return { mostrar };
  };
})(window.GC = window.GC || {});
