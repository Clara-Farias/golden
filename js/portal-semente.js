(function (GC) {
  // Demonstração do Portal do Cidadão: na primeira visita (por cidade e por navegador), dois pedidos dos moradores
  // que já estão no registro (js/pedidos.js, semente) passam a ser "deste aparelho". Assim "Seus pedidos" já mostra
  // o protocolo e o andamento (Recebido → Encaminhado → Em campo → Resolvido) sem a pessoa ter de abrir um pedido.
  // Vem depois de js/pedidos.js e antes de js/portal-cidadao.js.
  if (!GC.pedidos || typeof localStorage === 'undefined') return;
  const chave = `gc.pedidos.meus-semente.${GC.cidade ? GC.cidade.id : 'media'}`;
  try {
    if (localStorage.getItem(chave)) return;
    localStorage.setItem(chave, '1');
    const s = JSON.parse(localStorage.getItem(GC.CHAVE_PEDIDOS) || 'null') || (GC.pedidos.pontos(), JSON.parse(localStorage.getItem(GC.CHAVE_PEDIDOS) || 'null'));
    if (!s || !Array.isArray(s.pedidos) || s.pedidos.some((p) => p.meu)) return;
    const situacao = (p) => (s.pontos.find((x) => x.id === p.pontoId) || {}).situacao;
    // Um pedido andando (em campo ou encaminhado) e um resolvido, quando houver.
    const escolhidos = [];
    ['em_campo', 'encaminhado', 'resolvido'].forEach((sit) => {
      if (escolhidos.length >= 2) return;
      const p = s.pedidos.find((x) => situacao(x) === sit && !escolhidos.includes(x) && !escolhidos.some((y) => y.pontoId === x.pontoId));
      if (p && !(sit === 'encaminhado' && escolhidos.some((y) => situacao(y) !== 'resolvido'))) escolhidos.push(p);
    });
    if (!escolhidos.length) return;
    escolhidos.forEach((p) => { p.meu = true; });
    localStorage.setItem(GC.CHAVE_PEDIDOS, JSON.stringify(s));
  } catch (e) { /* sem armazenamento: o portal só não traz os pedidos de exemplo */ }
})(window.GC = window.GC || {});
