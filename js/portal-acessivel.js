(function (GC) {
  // Barra de acessibilidade do Portal do Cidadão (workshop de 18/11: atender quem tem pouca familiaridade com
  // tecnologia, inclusive pessoas idosas). Segue o padrão do gov.br: fica no alto da página e vale para todo o portal.
  //   - Tamanho do texto: normal, maior e muito maior (zoom nas partes de texto; o mapa fica do mesmo tamanho);
  //   - Alto contraste: fundo preto, texto branco e links amarelos;
  //   - Ouvir: lê em voz alta a manchete e os avisos de agora (Web Speech, sem enviar nada para fora).
  // As escolhas ficam neste aparelho (gc.portal.acessivel).
  const CHAVE = 'gc.portal.acessivel';
  const TAMANHOS = [1, 1.15, 1.3];
  const ic = (n) => `<i class="ti ti-${n}" aria-hidden="true"></i>`;
  const ler = () => { try { return JSON.parse(localStorage.getItem(CHAVE)) || {}; } catch (e) { return {}; } };
  const gravar = (v) => { try { localStorage.setItem(CHAVE, JSON.stringify(v)); } catch (e) { /* sem armazenamento: vale até recarregar */ } };
  const fala = typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance === 'function';

  let estado = Object.assign({ tamanho: 0, contraste: false }, ler());
  let falando = false;

  function aplicar() {
    const raiz = document.documentElement;
    raiz.style.setProperty('--pa-zoom', String(TAMANHOS[estado.tamanho] || 1));
    raiz.classList.toggle('pa-texto-maior', estado.tamanho > 0);
    raiz.classList.toggle('pa-contraste', !!estado.contraste);
    const barra = document.getElementById('pa-barra');
    if (!barra) return;
    barra.querySelectorAll('[data-pa-tam]').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.paTam) === estado.tamanho)));
    const c = barra.querySelector('[data-pa="contraste"]');
    if (c) c.setAttribute('aria-pressed', String(!!estado.contraste));
    const o = barra.querySelector('[data-pa="ouvir"]');
    if (o) {
      o.setAttribute('aria-pressed', String(falando));
      o.innerHTML = falando ? `${ic('player-stop')} <span>Parar de ler</span>` : `${ic('volume')} <span>Ouvir os avisos</span>`;
      o.setAttribute('aria-label', falando ? 'Parar de ler' : 'Ouvir os avisos em voz alta');
    }
  }

  // O texto lido: a manchete da capa e os avisos de agora, do jeito que estão na página.
  function textoParaOuvir() {
    const t = (id) => { const el = document.getElementById(id); return el ? el.textContent.trim() : ''; };
    const partes = [];
    const cidade = t('p-cidade');
    if (cidade) partes.push(`Prefeitura de ${cidade}.`);
    const titulo = t('t-inicio');
    const sub = t('p-inicio-sub');
    if (titulo) partes.push(`${titulo}.`);
    if (sub) partes.push(sub);
    const avisos = [...document.querySelectorAll('#sec-avisos .p-aviso-c')];
    if (avisos.length) {
      partes.push(avisos.length === 1 ? 'Há um aviso da Prefeitura.' : `Há ${avisos.length} avisos da Prefeitura.`);
      avisos.slice(0, 6).forEach((li, i) => {
        const tit = li.querySelector('.p-aviso-c-tit');
        const nivel = li.classList.contains('urgente') ? 'urgente' : li.classList.contains('atencao') ? 'de atenção' : '';
        if (tit) partes.push(`Aviso ${i + 1}${nivel ? `, ${nivel}` : ''}: ${tit.textContent.trim()}.`);
      });
    }
    const emerg = document.getElementById('p-emergencia');
    if (emerg && !emerg.hidden && emerg.textContent.trim()) partes.push('Em perigo, ligue 199 para a Defesa Civil, 193 para os Bombeiros ou 192 para o SAMU.');
    partes.push('Para pedir um serviço, use os botões grandes logo abaixo da manchete, ou ligue 156.');
    return partes.join(' ');
  }

  function parar() {
    if (fala) window.speechSynthesis.cancel();
    falando = false;
    aplicar();
  }
  function ouvir() {
    if (!fala) return;
    if (falando) { parar(); return; }
    const u = new SpeechSynthesisUtterance(textoParaOuvir());
    u.lang = 'pt-BR';
    u.rate = 0.95;
    const voz = window.speechSynthesis.getVoices().find((v) => /^pt(-|_)BR/i.test(v.lang));
    if (voz) u.voice = voz;
    u.onend = () => { falando = false; aplicar(); };
    u.onerror = () => { falando = false; aplicar(); };
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
    falando = true;
    aplicar();
  }

  function montar() {
    if (document.getElementById('pa-barra')) return;
    const barra = document.createElement('div');
    barra.id = 'pa-barra';
    barra.className = 'pa-barra';
    barra.setAttribute('role', 'region');
    barra.setAttribute('aria-label', 'Acessibilidade');
    barra.innerHTML = `<div class="pa-in">
        <span class="pa-rot">${ic('accessible')} <span>Acessibilidade</span></span>
        <div class="pa-grupo" role="group" aria-label="Tamanho do texto">
          <span class="pa-sub">Texto</span>
          <button type="button" data-pa-tam="0" aria-label="Texto no tamanho normal">A</button>
          <button type="button" data-pa-tam="1" aria-label="Texto maior" class="pa-a1">A+</button>
          <button type="button" data-pa-tam="2" aria-label="Texto muito maior" class="pa-a2">A++</button>
        </div>
        <button type="button" data-pa="contraste" aria-pressed="false" aria-label="Alto contraste">${ic('contrast-2')} <span>Alto contraste</span></button>
        ${fala ? '<button type="button" data-pa="ouvir" aria-pressed="false"></button>' : ''}
      </div>`;
    const topo = document.querySelector('.p-topo');
    document.body.insertBefore(barra, topo || document.body.firstChild);
    barra.addEventListener('click', (e) => {
      const tam = e.target.closest('[data-pa-tam]');
      if (tam) { estado.tamanho = Number(tam.dataset.paTam) || 0; gravar(estado); aplicar(); return; }
      const b = e.target.closest('[data-pa]');
      if (!b) return;
      if (b.dataset.pa === 'contraste') { estado.contraste = !estado.contraste; gravar(estado); aplicar(); }
      if (b.dataset.pa === 'ouvir') ouvir();
    });
    window.addEventListener('pagehide', () => { if (falando) parar(); });
    aplicar();
  }

  GC.portalAcessivel = { aplicar, ouvir, parar, textoParaOuvir, estado: () => Object.assign({}, estado) };
  aplicar();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', montar);
  else montar();
})(window.GC = window.GC || {});
