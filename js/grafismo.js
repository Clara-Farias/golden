(function (GC) {
  // Grafismo da marca Golden Atlas (manual, cap. 05 · Elementos de apoio), portado do manual
  // (identidade-visual/manual/index.html) para o app. Só gera SVG em texto; quem usa decide onde.
  //
  // Regras que valem aqui (e que quem chama precisa respeitar):
  // - Um grafismo de fundo por peça: curvas de nível (território e dados) OU campo "achar o alerta" (produto).
  // - Curvas: saem pela borda, até 20% de opacidade, em branco, Egeu ou Titã; nunca Chama; nunca atrás de dado.
  // - No painel do gestor, curvas só na moldura (a doca Titã e os cabeçalhos dos painéis dela, em branco a 20%,
  //   atrás só do título: css/doca.css + css/img/curvas-nivel.svg) e no estado vazio; no portal, o topo das páginas.
  // - Recursos de apoio (alvo, cota, moldura, régua, escala, norte, rota, hachura, perfil): 2 ou 3 por peça.
  const G = {};
  const n = (v) => +v.toFixed(1);
  const ANG = 16; // ângulo das laterais do A
  function rng(s) { let x = s % 2147483647; if (x <= 0) x += 2147483646; return () => ((x = (x * 16807) % 2147483647) - 1) / 2147483646; }
  G.rng = rng;

  const SIMBOLO = 'M27.467 56.736C26.741 58.695 24.872 59.996 22.783 59.996C17.849 60 7.999 60 7.999 60C5.805 60 3.999 58.194 3.999 56C3.999 55.631 4.05 55.265 4.15 54.91L17.15 8.91C17.636 7.193 19.215 5.999 21 6L43 6C44.785 5.999 46.364 7.193 46.85 8.91L59.85 54.91C59.95 55.265 60.001 55.631 60.001 56C60.001 58.194 58.195 60 56.001 60C56.001 60 46.151 60 41.217 60C39.126 60 37.255 58.699 36.528 56.738C35.6 54.257 35.6 51.514 35.6 48L35.6 36.1C35.6 34.125 33.975 32.5 32 32.5C30.025 32.5 28.4 34.125 28.4 36.1L28.4 48C28.4 51.514 28.4 54.257 27.467 56.736ZM26.4 22C26.4 25.072 28.928 27.6 32 27.6C35.072 27.6 37.6 25.072 37.6 22C37.6 18.928 35.072 16.4 32 16.4C28.928 16.4 26.4 18.928 26.4 22Z';
  // Símbolo com a caixa útil (56 × 54) começando em 0,0.
  const simb = (cor) => `<path d="${SIMBOLO}" fill="${cor}" fill-rule="evenodd" transform="translate(-4 -6)"/>`;
  G.simbolo = simb;

  // Curvas de nível (marching squares sobre um relevo de morros gaussianos).
  // Por padrão os morros ficam perto das bordas, para as curvas "saírem pela borda" e o centro ficar limpo.
  G.curvas = function ({ w, h, cor = 'currentColor', op = 0.16, morros, semente = 7, niveis = 14, esp }) {
    const r = rng(semente);
    if (!morros) {
      const borda = () => (r() < 0.5 ? -0.08 - r() * 0.12 : 1.08 + r() * 0.12);
      morros = Array.from({ length: 4 }, (_, i) => {
        const lado = i % 2 === 0;
        return { x: (lado ? borda() : r()) * w, y: (lado ? r() : borda()) * h, s: (0.22 + r() * 0.28) * Math.max(w, h), a: 0.6 + r() * 0.8 };
      });
    }
    const f = (x, y) => morros.reduce((t, m) => t + m.a * Math.exp(-((x - m.x) ** 2 + (y - m.y) ** 2) / (2 * m.s ** 2)), 0)
      + 0.06 * Math.sin((x / w) * 9 + (y / h) * 4) + 0.05 * Math.cos((y / h) * 11 - (x / w) * 3);
    const p = Math.max(w, h) / 72; const nx = Math.ceil(w / p) + 1; const ny = Math.ceil(h / p) + 1; const v = [];
    let mn = Infinity; let mx = -Infinity;
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const z = f(i * p, j * p); v.push(z); mn = Math.min(mn, z); mx = Math.max(mx, z); }
    let d = '';
    for (let k = 1; k < niveis; k++) {
      const L = mn + ((mx - mn) * k) / niveis;
      for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
        const a = v[j * nx + i]; const b = v[j * nx + i + 1]; const c = v[(j + 1) * nx + i + 1]; const e = v[(j + 1) * nx + i];
        const X = i * p; const Y = j * p; const pts = [];
        const cr = (z1, z2, P, Q) => { if ((z1 < L) !== (z2 < L)) { const t = (L - z1) / (z2 - z1); pts.push([P[0] + (Q[0] - P[0]) * t, P[1] + (Q[1] - P[1]) * t]); } };
        cr(a, b, [X, Y], [X + p, Y]); cr(b, c, [X + p, Y], [X + p, Y + p]); cr(c, e, [X + p, Y + p], [X, Y + p]); cr(e, a, [X, Y + p], [X, Y]);
        for (let q = 0; q + 1 < pts.length; q += 2) d += `M${n(pts[q][0])} ${n(pts[q][1])}L${n(pts[q + 1][0])} ${n(pts[q + 1][1])}`;
      }
    }
    return `<path d="${d}" fill="none" stroke="${cor}" stroke-opacity="${Math.min(op, 0.2)}" stroke-width="${n(esp || Math.max(w, h) / 600)}" stroke-linecap="round" vector-effect="non-scaling-stroke"/>`;
  };

  // SVG de fundo pronto para colocar dentro de um elemento com position: relative.
  G.fundo = (corpo, w, h, classe = 'ga-grafismo') => `<svg class="${classe}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">${corpo}</svg>`;

  // ---- Caixa de ferramentas ----
  // Alvo: só anéis (no app, pino colorido é ocorrência).
  G.alvo = (x, y, r, cor = 'currentColor', op = 0.8) => [1, 2.3, 4].map((k, i) => `<circle cx="${x}" cy="${y}" r="${n(r * k)}" fill="none" stroke="${cor}" stroke-opacity="${n(op * (1 - i * 0.3))}" stroke-width="${n(r / 6)}"/>`).join('');
  // Régua cartográfica: divisória e rodapé.
  G.regua = (L = 240, a = 6, segs = 12, cor = 'currentColor') => {
    const p = L / segs;
    let s = `<rect x="0.5" y="0.5" width="${L - 1}" height="${a - 1}" fill="none" stroke="${cor}" stroke-width="1"/>`;
    for (let i = 0; i < segs; i += 2) s += `<rect x="${n(i * p)}" y="0" width="${n(p)}" height="${a}" fill="${cor}"/>`;
    return `<svg class="ga-regua" viewBox="0 0 ${L} ${a}" width="${L}" height="${a}" aria-hidden="true" focusable="false">${s}</svg>`;
  };
  // Moldura: cantoneiras e coordenadas (lugar no mapa).
  G.moldura = (w, h, m, cor, t, coords) => {
    const l = t * 1.6; const sw = n(t / 8);
    let s = [[m, m, 1, 1], [w - m, m, -1, 1], [m, h - m, 1, -1], [w - m, h - m, -1, -1]]
      .map(([x, y, sx, sy]) => `<path d="M${x + sx * l} ${y}L${x} ${y}L${x} ${y + sy * l}" fill="none" stroke="${cor}" stroke-opacity=".7" stroke-width="${sw}"/>`).join('');
    const tx = (x, y, s2, a) => `<text x="${x}" y="${y}" text-anchor="${a}" font-family="Inter, sans-serif" font-weight="500" font-size="${t}" letter-spacing="${n(t * 0.08)}" fill="${cor}" fill-opacity=".65">${s2}</text>`;
    if (coords) s += tx(w - m - l - t * 0.6, m + t * 0.35, coords[0], 'end') + tx(m + l + t * 0.6, h - m + t * 0.35, coords[1], 'start');
    return s;
  };
  // Perfil topográfico: divisória de capítulo.
  // Os pontos do perfil (o PDF do relatório desenha com eles, sem SVG).
  G.perfilPontos = (L = 600, a = 40, sem = 4) => {
    const g = rng(sem); const f = [g() * 6, g() * 6, g() * 6];
    return Array.from({ length: 121 }, (_, i) => {
      const t = i / 120; const z = 0.5 + 0.22 * Math.sin(t * 7 + f[0]) + 0.14 * Math.sin(t * 13 + f[1]) + 0.08 * Math.sin(t * 29 + f[2]) + 0.25 * Math.exp(-((t - 0.62) ** 2) / 0.01);
      return [t * L, a - Math.max(0, Math.min(1, z)) * a];
    });
  };
  G.perfil = (L = 600, a = 40, cor = 'currentColor', sem = 4) => {
    const pts = G.perfilPontos(L, a, sem);
    const ln = `M${pts.map((q) => `${n(q[0])} ${n(q[1])}`).join('L')}`;
    return `<svg class="ga-perfil" viewBox="0 0 ${L} ${a}" preserveAspectRatio="none" aria-hidden="true" focusable="false"><path d="${ln}L${L} ${a}L0 ${a}Z" fill="${cor}" fill-opacity=".1"/><path d="${ln}" fill="none" stroke="${cor}" stroke-opacity=".6" stroke-width="1.2" vector-effect="non-scaling-stroke"/><path d="M0 ${a}L${L} ${a}" stroke="${cor}" stroke-opacity=".4" stroke-width="1" vector-effect="non-scaling-stroke"/></svg>`;
  };

  // ---- Achar o alerta: campo de símbolos apagados, um aceso em Chama ----
  const suave = (t) => t * t * (3 - 2 * t);
  const distRet = (px, py, r) => Math.hypot(Math.max(r.x - px, 0, px - (r.x + r.w)), Math.max(r.y - py, 0, py - (r.y + r.h)));
  // logo (data URL ou caminho): a marca própria da prefeitura (Personalizar) no lugar do símbolo. Os apagados viram
  // a silhueta do logo na cor `cor`; o aceso fica com as cores do logo, numa placa clara (qualquer logo se lê no fundo).
  let idLogo = 0;
  const attr = (t) => String(t).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  const rgb01 = (hex) => { const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '')); const v = m ? parseInt(m[1], 16) : 0xffffff; return [(v >> 16) & 255, (v >> 8) & 255, v & 255].map((x) => +(x / 255).toFixed(3)); };
  G.campoAlerta = function ({ w, h, k, cor, op, zonas = [], alvo, corAceso = '#f36f21', logo = null }) {
    if (logo) {
      const id = `ga-logo-${++idLogo}`;
      const [r, g, b] = rgb01(cor);
      const img = (sufixo, filtro) => `<image id="${id}${sufixo}" href="${attr(logo)}" x="2" y="1" width="52" height="52" preserveAspectRatio="xMidYMid meet"${filtro ? ` filter="url(#${id}-f)"` : ''}/>`;
      const defs = `<defs><filter id="${id}-f" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="0 0 0 0 ${r} 0 0 0 0 ${g} 0 0 0 0 ${b} 0 0 0 1 0"/></filter>${img('', true)}${img('-cor', false)}</defs>`;
      return defs + desenharCampo({ w, h, k, op, zonas, alvo, apagado: `<use href="#${id}"/>`, aceso: `<rect x="-3" y="-4" width="62" height="62" rx="14" fill="#fff"/><use href="#${id}-cor"/>` });
    }
    return desenharCampo({ w, h, k, op, zonas, alvo, apagado: simb(cor), aceso: simb(corAceso) });
  };
  function desenharCampo({ w, h, k, op, zonas, alvo, apagado, aceso: desenhoAceso }) {
    const px = 1.5 * 56 * k; const py = 1.35 * 54 * k; const trans = 3 * px; const cels = [];
    for (let r = -1; r * py < h + py; r++) for (let c = -1; c * px < w + px; c++) {
      const x = c * px + (r % 2 ? px / 2 : 0); const y = r * py; const cx = x + 28 * k; const cy = y + 27 * k;
      let f = 1; for (const z of zonas) { const dz = distRet(cx, cy, z); f = Math.min(f, dz <= 0 ? 0 : suave(Math.min(1, dz / trans))); }
      cels.push({ x, y, cx, cy, f });
    }
    const aceso = alvo && cels.filter((c) => c.f >= 1 && c.x >= px * 0.5 && c.y >= py * 0.5 && c.x + 56 * k <= w - px * 0.5 && c.y + 54 * k <= h - py * 0.5)
      .sort((a, b) => Math.hypot(a.cx - alvo[0], a.cy - alvo[1]) - Math.hypot(b.cx - alvo[0], b.cy - alvo[1]))[0];
    let s = '';
    for (const c of cels) {
      if (c === aceso || c.f <= 0.03) continue;
      const e = k * (0.45 + 0.55 * c.f);
      s += `<g transform="translate(${n(c.cx - 28 * e)} ${n(c.cy - 27 * e)}) scale(${+e.toFixed(3)})" opacity="${+(op * c.f).toFixed(3)}">${apagado}</g>`;
    }
    if (aceso) s += `<g class="ga-aceso" transform="translate(${n(aceso.x)} ${n(aceso.y)}) scale(${k})">${desenhoAceso}</g>`;
    return s;
  }

  // Semente estável a partir de um texto (o mesmo bairro tem sempre o mesmo relevo).
  G.semente = (texto) => { let s = 7; for (const ch of String(texto || '')) s = (s * 31 + ch.charCodeAt(0)) % 2147483647; return s || 7; };
  G.ANG = ANG;

  // "22°53′S 47°05′O" a partir de [lat, lng].
  G.coord = ([lat, lng]) => {
    const gm = (v) => { const a = Math.abs(v); const g = Math.floor(a); const m = Math.round((a - g) * 60); return `${g}°${String(m).padStart(2, '0')}′`; };
    return `${gm(lat)}${lat < 0 ? 'S' : 'N'} ${gm(lng)}${lng < 0 ? 'O' : 'L'}`;
  };

  // Relevo de topo (portal): curvas saindo pela borda direita, cantoneiras e, se houver, a coordenada.
  // cor: branco sobre Titã, Egeu sobre Névoa. Fica atrás do título, nunca atrás de dado.
  G.relevoTopo = ({ semente = 7, cor = '#008080', op = 0.18, coord = null, w = 960, h = 200 } = {}) => {
    const morros = [{ x: w * 1.02, y: h * 0.1, s: h * 1.1, a: 1.2 }, { x: w * 0.82, y: h * 1.15, s: h * 0.9, a: 0.8 }, { x: w * 1.1, y: h * 0.9, s: h * 0.7, a: 0.6 }];
    const corpo = G.curvas({ w, h, cor, op, morros, semente, niveis: 16, esp: 1.2 })
      + (coord ? G.moldura(w, h, 14, cor, 11, [coord, '']) : '');
    return G.fundo(corpo, w, h, 'ga-relevo');
  };

  // Hachura a 16° como imagem para o MapLibre (fill-pattern): área de interesse no mapa nunca é só mancha de cor.
  // A inclinação 2:7 dá 15,9°, e o ladrilho fecha a emenda (passo 10 px, altura 35 px).
  G.hachuraImagem = (cor, { passo = 10, espessura = 2, op = 0.6, escala = 2 } = {}) => {
    if (typeof document === 'undefined') return null;
    const w = passo * escala; const h = passo * 3.5 * escala;
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d');
    x.strokeStyle = cor; x.globalAlpha = op; x.lineWidth = espessura * escala; x.lineCap = 'butt';
    for (let j = -2; j <= 2; j++) { x.beginPath(); x.moveTo(j * w, h); x.lineTo(j * w + w, 0); x.stroke(); }
    return { width: w, height: h, data: new Uint8Array(x.getImageData(0, 0, w, h).data.buffer), pixelRatio: escala };
  };

  // A mesma hachura a 16° como <pattern> de SVG (minimapas desenhados à mão). Use fill="url(#id)" por cima da cor.
  G.hachuraSvg = (id, cor = 'currentColor', { passo = 7, espessura = 1.4, op = 0.7 } = {}) =>
    `<pattern id="${id}" patternUnits="userSpaceOnUse" width="${passo}" height="${passo}" patternTransform="rotate(${ANG})"><line x1="0" y1="0" x2="0" y2="${passo}" stroke="${cor}" stroke-width="${espessura}" stroke-opacity="${op}"/></pattern>`;

  // Cota (recurso de apoio): o número no relevo. Linha de chamada saindo do ponto, valor em Inter tabular.
  G.cota = (x, y, dx, dy, valor, rotulo, cor = 'currentColor', t = 14) =>
    `<g class="ga-cota"><circle cx="${x}" cy="${y}" r="${n(t / 4)}" fill="${cor}"/><polyline points="${x},${y} ${x + dx},${y + dy} ${x + dx + t * 3},${y + dy}" fill="none" stroke="${cor}" stroke-width="${n(t / 10)}" stroke-opacity=".7"/>`
    + `<text x="${x + dx}" y="${n(y + dy - t * 0.5)}" font-family="Inter, sans-serif" font-weight="700" font-size="${n(t * 1.6)}" fill="${cor}" style="font-variant-numeric: tabular-nums">${valor}</text>`
    + (rotulo ? `<text x="${x + dx}" y="${n(y + dy + t * 1.3)}" font-family="Inter, sans-serif" font-weight="500" font-size="${t}" fill="${cor}" fill-opacity=".75">${rotulo}</text>` : '') + '</g>';

  GC.grafismo = G;
})(window.GC = window.GC || {});
