(function (GC) {
  // Página de privacidade (privacidade.html): nome da cidade, link de volta (painel ou entrada) e o botão que
  // apaga deste navegador o que a demonstração guardou (sessão, senhas, cadastro e auditoria).
  document.addEventListener('DOMContentLoaded', () => {
    const q = new URLSearchParams(window.location.search);
    const cidade = GC.cidade ? GC.cidade.nome : 'Vila Dourada';
    document.querySelectorAll('.pv-cidade').forEach((s) => { s.textContent = cidade; });
    document.title = `Privacidade · ${cidade} · Golden Atlas`;

    // Volta para onde a pessoa estava: com login, a entrada (que leva ao painel se a sessão estiver aberta).
    const voltar = document.getElementById('pv-voltar');
    const u = new URL(q.get('login') === '1' ? 'entrar.html' : 'index.html', window.location.href);
    if (GC.cidade) u.searchParams.set('cidade', GC.cidade.id);
    if (q.get('login') === '1') u.searchParams.set('login', '1');
    voltar.href = u.toString();
    if (document.referrer && new URL(document.referrer).origin === window.location.origin) {
      voltar.addEventListener('click', (ev) => { ev.preventDefault(); history.back(); });
    }

    // Cobranças e operação da pasta guardam nomes, descrições e fotos enviadas como evidência.
    const CHAVES = (k) => k.startsWith('vd-login-') || k === 'vd-auditoria'
      || k.startsWith('gc.cobrancas.') || k.startsWith('gc.operacao.') || k.startsWith('gc.ajudas.') || k.startsWith('gc.acoesPrefeito.') || k.startsWith('gc.pactos.') || k.startsWith('gc.presenca.') || k.startsWith('gc.pedidos.');
    document.getElementById('pv-apagar').addEventListener('click', async () => {
      const texto = 'Saem deste navegador a sessão, as senhas trocadas, os usuários cadastrados, a auditoria, as cobranças e a operação das pastas (com as fotos enviadas) da demonstração.';
      const confirmou = GC.confirmar
        ? await GC.confirmar({ titulo: 'Apagar os dados da demonstração?', texto, sim: 'Apagar os dados', perigo: true, nota: 'Não dá para desfazer.' })
        : window.confirm(`${texto} Não dá para desfazer.`);
      if (!confirmou) return;
      let n = 0;
      try {
        Object.keys(window.localStorage).filter(CHAVES).forEach((k) => { window.localStorage.removeItem(k); n += 1; });
      } catch (e) { /* sem armazenamento: nada guardado */ }
      const ok = document.getElementById('pv-apagado');
      ok.textContent = n ? 'Pronto: os dados da demonstração foram apagados deste navegador.' : 'Não havia dados da demonstração guardados neste navegador.';
      ok.hidden = false;
    });
  });
})(window.GC = window.GC || {});
