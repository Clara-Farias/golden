(function (GC) {
  // Tema da interface: claro ou Titã noturno (identidade-visual/paleta.md). Carregado no <head> para a
  // página já abrir no tema salvo, sem piscar. O botão de tema do mapa (js/map.js) chama aplicarTemaInterface.
  const CHAVE = 'vd-mapa-tema';
  const raiz = document.documentElement;
  const reduzir = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  GC.aplicarTemaInterface = function (tema) {
    const escuro = tema === 'escuro';
    if ((raiz.dataset.tema === 'escuro') === escuro) return;
    if (!reduzir()) {
      raiz.classList.add('trocando-tema');
      clearTimeout(GC.aplicarTemaInterface.t);
      GC.aplicarTemaInterface.t = setTimeout(() => raiz.classList.remove('trocando-tema'), 400);
    }
    if (escuro) raiz.dataset.tema = 'escuro';
    else delete raiz.dataset.tema;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = escuro ? '#081519' : '#0f4c5c';
  };

  try { if (localStorage.getItem(CHAVE) === 'escuro') raiz.dataset.tema = 'escuro'; } catch (e) { /* sem armazenamento */ }
})(window.GC = window.GC || {});
