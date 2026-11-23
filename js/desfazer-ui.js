(function (GC) {
  // Janela de confirmação (GC.confirmar) e aviso "Feito · Desfazer" (GC.mostrarDesfazer), usados pelo app
  // (js/app/desfazer.js) e por telas com ação de efeito grande. Estilo em css/desfazer.css.
  const esc = (t) => (GC.escaparHtml ? GC.escaparHtml(t) : String(t));

  // { titulo, texto, sim, nao?, perigo?, nota? } → Promise<boolean>. Esc ou clique fora cancelam; Enter confirma.
  // nota: a linha de rodapé. Padrão: o aviso de que dá para desfazer; false tira (ação que não passa pelo Desfazer);
  // um texto troca a linha.
  GC.confirmar = function ({ titulo, texto = '', sim = 'Confirmar', nao = 'Cancelar', perigo = false, nota = true } = {}) {
    const rodape = nota === true ? 'Dá para desfazer logo depois, pelo aviso que aparece embaixo.' : nota || '';
    return new Promise((resolver) => {
      const antes = document.activeElement;
      const fundo = document.createElement('div');
      fundo.className = 'cf-fundo';
      fundo.innerHTML = `
        <div class="cf-janela" role="alertdialog" aria-modal="true" aria-labelledby="cf-titulo" aria-describedby="cf-texto">
          <h2 id="cf-titulo">${esc(titulo)}</h2>
          ${texto ? `<p id="cf-texto">${esc(texto)}</p>` : ''}
          ${rodape ? `<p class="cf-nota">${esc(rodape)}</p>` : ''}
          <div class="cf-botoes">
            <button type="button" class="btn-sec" data-cf="nao">${esc(nao)}</button>
            <button type="button" class="btn-acao principal${perigo ? ' cf-perigo' : ''}" data-cf="sim">${esc(sim)}</button>
          </div>
        </div>`;
      let feito = false;
      function fechar(r) {
        if (feito) return;
        feito = true;
        document.removeEventListener('keydown', tecla, true);
        fundo.remove();
        if (antes && antes.focus) try { antes.focus(); } catch (e) { /* sumiu */ }
        resolver(r);
      }
      // Captura: o Esc daqui não chega ao Esc geral do painel (que fecharia a gaveta por trás).
      function tecla(e) {
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); fechar(false); }
        else if (e.key === 'Tab') {
          const bs = [...fundo.querySelectorAll('button')];
          const i = bs.indexOf(document.activeElement);
          e.preventDefault();
          bs[(i + (e.shiftKey ? -1 : 1) + bs.length) % bs.length].focus();
        }
      }
      fundo.addEventListener('click', (e) => {
        const b = e.target.closest('[data-cf]');
        if (b) fechar(b.dataset.cf === 'sim');
        else if (e.target === fundo) fechar(false);
      });
      // A gaveta fecha com clique fora dela: o clique na janela não conta como "fora".
      fundo.addEventListener('pointerdown', (e) => e.stopPropagation());
      fundo.dataset.abreGaveta = '';
      document.addEventListener('keydown', tecla, true);
      document.body.appendChild(fundo);
      fundo.querySelector('[data-cf="sim"]').focus();
    });
  };

  // ---- aviso embaixo: "✓ Priorizada: … · Desfazer" ----
  const VISIVEL_MS = 10000;
  let el = null;
  let fim = null;
  function aviso() {
    if (el) return el;
    el = document.createElement('div');
    el.className = 'dz-aviso';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.hidden = true;
    el.dataset.abreGaveta = '';
    el.addEventListener('pointerdown', (e) => e.stopPropagation());
    document.body.appendChild(el);
    return el;
  }
  function esconder() { if (el) { el.classList.add('saindo'); setTimeout(() => { el.hidden = true; el.classList.remove('saindo'); }, 200); } }
  function mostrar(html, ms) {
    const a = aviso();
    a.innerHTML = html;
    a.hidden = false;
    a.classList.remove('saindo');
    clearTimeout(fim);
    fim = setTimeout(esconder, ms);
    const x = a.querySelector('[data-dz-fechar]');
    if (x) x.onclick = () => { clearTimeout(fim); esconder(); };
    return a;
  }

  GC.mostrarDesfazer = function (item, aoDesfazer) {
    const a = mostrar(`<span class="dz-texto">✓ ${esc(item.rotulo)}</span>
      <button type="button" class="dz-botao" data-dz-desfazer>Desfazer</button>
      ${item.semAtalho ? '' : '<small class="dz-dica">ou Ctrl+Z</small>'}
      <button type="button" class="dz-x" data-dz-fechar aria-label="Fechar aviso">✕</button>`, VISIVEL_MS);
    a.querySelector('[data-dz-desfazer]').onclick = () => { clearTimeout(fim); esconder(); aoDesfazer(); };
  };

  // Recado curto (desfeito, ou por que não deu).
  GC.avisoDesfazer = function (texto, ok) {
    mostrar(`<span class="dz-texto${ok ? '' : ' dz-nao'}">${ok ? '↩ ' : ''}${esc(texto)}</span><button type="button" class="dz-x" data-dz-fechar aria-label="Fechar aviso">✕</button>`, ok ? 4000 : 7000);
  };
})(window.GC = window.GC || {});
