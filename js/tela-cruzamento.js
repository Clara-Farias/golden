(function (GC) {
  // Tela "Cruzamento de dados" (#/cruzamento/<a>/<b>): dois indicadores por bairro, lado a lado.
  // Dispersão (cada ponto um bairro, linhas nas medianas da cidade) e o mapa dos bairros nas mesmas 4 cores:
  // ruim nos dois, ruim só em um, ruim só no outro, bem nos dois (os nomes dizem o indicador: GC.cruzamento.rotulos).
  // Clicar num bairro (ponto, mapa ou lista) seleciona nos três; passar o mouse realça nos três. Quando os dois
  // indicadores têm série mensal do mesmo conceito, a linha do tempo da cidade aparece embaixo.
  // O motor é js/cruzamento.js (o mesmo da Maia); aqui é só o desenho.
  const esc = (t) => GC.escaparHtml(t);
  const fmt = (i, v) => GC.cruzamento.formatar(i, v);
  const ORDEM = ['ambos', 'soA', 'soB', 'nenhum'];
  const num = (v, casas = 2) => Number(v).toLocaleString('pt-BR', { maximumFractionDigits: casas });
  const rTexto = (r) => String(r).replace('.', ',').replace('-', '−');
  // Abaixo desta largura (a da tela, não a da janela) o gráfico é desenhado em outras medidas, para o texto
  // não encolher junto com o SVG.
  const LARGURA_COMPACTA = 620;
  // Ponto a menos disto (em px) da mediana no eixo que o fez "ruim" fica claro: está na divisa, não no extremo.
  const PERTO_MEDIANA_PX = 10;

  // Escala linear com folga e 4 marcas "redondas".
  function escala(valores, de, ate) {
    let lo = Math.min(...valores); let hi = Math.max(...valores);
    if (lo === hi) { lo -= 1; hi += 1; }
    const folga = (hi - lo) * 0.08;
    lo -= folga; hi += folga;
    const passo = Math.pow(10, Math.floor(Math.log10((hi - lo) / 4)));
    const p = [1, 2, 2.5, 5, 10].map((m) => m * passo).find((x) => (hi - lo) / x <= 5);
    const marcas = [];
    for (let v = Math.ceil(lo / p) * p; v <= hi; v += p) marcas.push(Math.round(v * 1000) / 1000 || 0); // || 0: sem "-0"
    return { f: (v) => de + ((v - lo) / (hi - lo)) * (ate - de), marcas };
  }

  // Bairros com o mesmo valor (ou quase) caem um em cima do outro: cada ponto que encostaria num já posto vai
  // para o lado, alternando direita e esquerda, só o bastante para aparecer. O valor do eixo não muda.
  function afastar(itens, raio, xMin, xMax) {
    const postos = [];
    const passo = raio * 1.7;
    let afastados = 0;
    itens.forEach((it) => {
      let x = it.x;
      for (const k of [0, 1, -1, 2, -2, 3, -3, 4, -4, 5, -5]) {
        const cx = it.x + k * passo;
        if (cx < xMin || cx > xMax) continue;
        if (!postos.some((p) => Math.hypot(p.x - cx, p.y - it.y) < raio * 2 - 1)) { x = cx; break; }
      }
      if (x !== it.x) afastados += 1;
      it.px = x;
      postos.push({ x, y: it.y });
    });
    return afastados;
  }

  // A relação em palavras de quem decide: "pioram juntos" ou "vão em sentidos opostos" (o ρ fica no detalhe).
  function relacao(res) {
    const f = res.forca;
    if (f.nivel === 'nd') return { titulo: 'Poucos bairros para medir', detalhe: `Só ${res.n} ${res.n === 1 ? 'bairro tem' : 'bairros têm'} os dois números.` };
    if (f.nivel === 'nenhuma') return { titulo: 'Não andam juntos', detalhe: `${res.a.curto.charAt(0).toUpperCase()}${res.a.curto.slice(1)} e ${res.b.curto} variam cada um por si.` };
    const juntos = (f.sentido === 'direta') === (res.a.ruim === res.b.ruim);
    return juntos
      ? { titulo: 'Pioram juntos', detalhe: `Onde ${res.a.curto} está pior, ${res.b.curto} também tende a estar.` }
      : { titulo: 'Vão em sentidos opostos', detalhe: `Onde ${res.a.curto} está pior, ${res.b.curto} tende a estar melhor.` };
  }

  function dispersao(res, sel, compacto) {
    const [W, H, ML, MR, MT, MB] = compacto ? [310, 300, 42, 10, 14, 44] : [560, 360, 56, 16, 14, 46];
    const R = compacto ? 6.5 : 6;
    const ex = escala(res.pontos.map((p) => p.a), ML, W - MR);
    const ey = escala(res.pontos.map((p) => p.b), H - MB, MT);
    const mx = ex.f(res.medianaA); const my = ey.f(res.medianaB);
    // O quadrante "ruim nos dois" fica sombreado: depende do sentido de cada indicador.
    const qx = res.a.ruim === 'alto' ? [mx, W - MR] : [ML, mx];
    const qy = res.b.ruim === 'alto' ? [MT, my] : [my, H - MB];
    const rotuloX = (v) => num(v, Math.abs(v) < 10 ? 1 : 0);
    // Posições (na ordem do motor, que não muda com a seleção) e o afastamento dos empilhados.
    const pos = res.pontos.map((p) => ({ p, x: ex.f(p.a), y: ey.f(p.b) }));
    const afastados = afastar(pos, R, ML + R, W - MR - R);
    const em = Object.fromEntries(pos.map((o) => [o.p.id, o]));
    // Na divisa: o eixo que deixou o bairro "ruim" está colado na mediana.
    const perto = (p) => {
      const o = em[p.id];
      const dA = Math.abs(o.x - mx); const dB = Math.abs(o.y - my);
      if (p.grupo === 'ambos') return Math.min(dA, dB) < PERTO_MEDIANA_PX;
      if (p.grupo === 'soA') return dA < PERTO_MEDIANA_PX;
      if (p.grupo === 'soB') return dB < PERTO_MEDIANA_PX;
      return false;
    };
    // Nomes escritos: o bairro selecionado e os 3 mais extremos do "ruim nos dois", sem um nome cobrir o outro
    // (o nome ocupa ~6,5 px por letra à direita do ponto). O resto aparece ao passar o mouse.
    // Sem espaço à direita, o nome vai para a esquerda do ponto.
    const caixas = [];
    const lado = {};
    const cabe = (p) => {
      const w = p.nome.length * 6.5; const { px, y } = em[p.id];
      const opcoes = [['d', px + 10], ['e', px - 10 - w]];
      const ok = opcoes.find(([, x]) => x >= ML && x + w <= W - MR && !caixas.some((c) => x < c.x + c.w && c.x < x + w && Math.abs(y - c.y) < 15));
      if (!ok) return false;
      caixas.push({ x: ok[1], y, w });
      lado[p.id] = ok[0];
      return true;
    };
    const candidatos = [sel && res.pontos.find((p) => p.id === sel), ...res.grupos.ambos.slice(0, compacto ? 2 : 3)].filter(Boolean);
    const destaque = new Set(candidatos.filter((p, k) => candidatos.findIndex((q) => q.id === p.id) === k && cabe(p)).map((p) => p.id));
    const rot = GC.cruzamento.rotulos(res);
    const pontos = res.pontos.slice().sort((p, q) => (p.id === sel) - (q.id === sel)).map((p) => {
      const { px, y } = em[p.id];
      return `
      <g class="cz-p cz-${p.grupo}${p.id === sel ? ' sel' : ''}${perto(p) ? ' perto' : ''}" data-cz-bairro="${esc(p.id)}" tabindex="0" role="button" aria-pressed="${p.id === sel}" aria-label="${esc(p.nome)}, ${esc(rot[p.grupo])}: ${esc(fmt(res.a, p.a))}; ${esc(fmt(res.b, p.b))}">
        <circle class="cz-alvo" cx="${px.toFixed(1)}" cy="${y.toFixed(1)}" r="${compacto ? 14 : 11}"/>
        <circle class="cz-ponto" cx="${px.toFixed(1)}" cy="${y.toFixed(1)}" r="${p.id === sel ? R + 2 : R}"/>
        ${destaque.has(p.id) ? `<text x="${(px + (lado[p.id] === 'e' ? -10 : 10)).toFixed(1)}" y="${(y + 4).toFixed(1)}"${lado[p.id] === 'e' ? ' text-anchor="end"' : ''}>${esc(p.nome)}</text>` : ''}
      </g>`;
    }).join('');
    const svg = `<svg class="cz-svg${compacto ? ' compacto' : ''}" viewBox="0 0 ${W} ${H}" role="group" aria-label="Dispersão dos bairros: ${esc(res.a.nome)} no eixo horizontal, ${esc(res.b.nome)} no vertical">
      <rect class="cz-quad" x="${Math.min(...qx)}" y="${Math.min(...qy)}" width="${Math.abs(qx[1] - qx[0])}" height="${Math.abs(qy[1] - qy[0])}"/>
      ${ex.marcas.map((v) => `<line class="cz-grade" x1="${ex.f(v)}" x2="${ex.f(v)}" y1="${MT}" y2="${H - MB}"/><text class="cz-eixo" x="${ex.f(v)}" y="${H - MB + 16}" text-anchor="middle">${rotuloX(v)}</text>`).join('')}
      ${ey.marcas.map((v) => `<line class="cz-grade" x1="${ML}" x2="${W - MR}" y1="${ey.f(v)}" y2="${ey.f(v)}"/><text class="cz-eixo" x="${ML - 8}" y="${ey.f(v) + 4}" text-anchor="end">${rotuloX(v)}</text>`).join('')}
      <line class="cz-mediana" x1="${mx}" x2="${mx}" y1="${MT}" y2="${H - MB}"/><line class="cz-mediana" x1="${ML}" x2="${W - MR}" y1="${my}" y2="${my}"/>
      <text class="cz-eixo" x="${mx + 4}" y="${MT + 10}">mediana</text>
      <text class="cz-titulo-eixo" x="${(ML + W - MR) / 2}" y="${H - 8}" text-anchor="middle">${esc(compacto ? res.a.curto : res.a.nome)} (${esc(res.a.unidade)})</text>
      <text class="cz-titulo-eixo" transform="translate(14 ${(MT + H - MB) / 2}) rotate(-90)" text-anchor="middle">${esc(compacto ? res.b.curto : res.b.nome)} (${esc(res.b.unidade)})</text>
      ${pontos}
    </svg>`;
    return { svg, afastados, temPerto: res.pontos.some(perto) };
  }

  // Mapa dos bairros (polígonos de GC.data.bairros, [lat, lng]) em SVG, nas cores dos grupos.
  function mapa(res, sel) {
    const bs = GC.data.bairros;
    const pts = bs.flatMap((b) => b.poligono);
    const lat0 = pts.reduce((s, p) => s + p[0], 0) / pts.length;
    const k = Math.cos((lat0 * Math.PI) / 180);
    const xs = pts.map((p) => p[1] * k); const ys = pts.map((p) => p[0]);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const W = 360; const esc1 = (W - 16) / (x1 - x0); const H = Math.round((y1 - y0) * esc1 + 16);
    const px = (p) => `${(8 + (p[1] * k - x0) * esc1).toFixed(1)},${(8 + (y1 - p[0]) * esc1).toFixed(1)}`;
    const grupo = Object.fromEntries(res.pontos.map((p) => [p.id, p.grupo]));
    // O selecionado vai por último, para o contorno não ficar por baixo dos vizinhos.
    const ordem = bs.slice().sort((a, b) => (a.id === sel) - (b.id === sel));
    return `<svg class="cz-mapa" viewBox="0 0 ${W} ${H}" role="group" aria-label="Mapa dos bairros pelos grupos do cruzamento">
      ${ordem.map((b) => `<path class="cz-b cz-${grupo[b.id] || 'sem'}${b.id === sel ? ' sel' : ''}" data-cz-bairro="${esc(b.id)}" d="M${b.poligono.map(px).join('L')}Z"></path>`).join('')}
      ${sel ? (() => { const b = bs.find((x) => x.id === sel); return b ? `<text class="cz-mapa-nome" x="${px(b.centro).split(',')[0]}" y="${px(b.centro).split(',')[1]}" text-anchor="middle">${esc(b.nome)}</text>` : ''; })() : ''}
    </svg>`;
  }

  // Linha do tempo da cidade: as duas séries em índice (1º mês = 100), no mesmo eixo (nunca dois eixos).
  function tempo(t) {
    const W = 560; const H = 200; const ML = 40; const MR = 12; const MT = 12; const MB = 26;
    const ey = escala([...t.a, ...t.b], H - MB, MT);
    const x = (i) => ML + (i / (t.rotulos.length - 1)) * (W - ML - MR);
    const linha = (s, cls) => `<polyline class="cz-linha ${cls}" points="${s.map((v, i) => `${x(i).toFixed(1)},${ey.f(v).toFixed(1)}`).join(' ')}"/>`;
    return `<svg class="cz-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(t.rotuloA)} e ${esc(t.rotuloB)}, em índice, por mês">
      ${ey.marcas.map((v) => `<line class="cz-grade" x1="${ML}" x2="${W - MR}" y1="${ey.f(v)}" y2="${ey.f(v)}"/><text class="cz-eixo" x="${ML - 6}" y="${ey.f(v) + 4}" text-anchor="end">${num(v, 0)}</text>`).join('')}
      ${t.rotulos.map((m, i) => `<text class="cz-eixo" x="${x(i)}" y="${H - 8}" text-anchor="middle">${esc(m)}</text>`).join('')}
      ${linha(t.a, 'a')}${linha(t.b, 'b')}
    </svg>`;
  }

  GC.criarTelaCruzamento = function (el, { aoIr, aoVerNoMapa, aoBaixar }) {
    let res = null;
    let rota = null;
    let sel = null;
    let compacto = false;

    function csv() {
      const rot = GC.cruzamento.rotulos(res);
      const linhas = [['Bairro', `${res.a.nome} (${res.a.unidade})`, `${res.b.nome} (${res.b.unidade})`, 'Grupo'],
        ...GC.data.bairros.map((b) => { const p = res.pontos.find((x) => x.id === b.id); return [b.nome, p ? p.a : '', p ? p.b : '', p ? rot[p.grupo] : 'sem dado']; })];
      linhas.push([], ['Relação (Spearman)', res.r == null ? '' : res.r, res.forca.rotulo], ['Bairros com os dois números', res.n], ['Fontes', res.fontes.join(' · ')]);
      return `﻿${linhas.map((l) => l.map(GC.campoCsv || ((c) => String(c))).join(';')).join('\r\n')}\r\n`;
    }

    // Ficha do bairro selecionado (no cartão do mapa e, no celular, na folha que sobe do pé da tela).
    function ficha(rot, emFolha) {
      const p = sel && res.pontos.find((x) => x.id === sel);
      const b = sel && GC.data.bairros.find((x) => x.id === sel);
      const fechar = emFolha ? '<button type="button" class="cz-folha-fechar" data-cz="fechar" aria-label="Fechar a ficha do bairro"><i class="ti ti-x" aria-hidden="true"></i></button>' : '';
      if (b && !p) return `<div class="cz-ficha-topo"><b>${esc(b.nome)}</b>${fechar}</div><p>Sem um dos dois números neste bairro.</p>`;
      return `<div class="cz-ficha-topo"><b>${esc(b.nome)}</b> <span class="cz-tag cz-${p.grupo}">${esc(rot[p.grupo])}</span>${fechar}</div>
        <dl><dt>${esc(res.a.nome)}</dt><dd>${esc(fmt(res.a, p.a))} <small>mediana ${esc(fmt(res.a, res.medianaA))}</small></dd>
        <dt>${esc(res.b.nome)}</dt><dd>${esc(fmt(res.b, p.b))} <small>mediana ${esc(fmt(res.b, res.medianaB))}</small></dd></dl>
        <span class="cz-bairro-acoes"><button type="button" class="btn-sec" data-cz="mapa-bairro">Destacar no mapa</button>
        <button type="button" class="btn-sec btn-maia-tela" data-maia="Como está o bairro ${esc(b.nome)}?">Panorama com a Maia</button></span>`;
    }

    // Sem bairro escolhido, a coluna não fica vazia: os 3 piores nos dois, prontos para abrir.
    function porOndeComecar() {
      const top = res.grupos.ambos.slice(0, 3);
      if (!top.length) return '<p>Nenhum bairro está do lado ruim nos dois. Toque num bairro para ver os números dele.</p>';
      return `<h4 class="cz-olhar-titulo">Por onde começar</h4>
        <ol class="cz-olhar">${top.map((p) => `<li><button type="button" class="cz-olhar-item" data-cz-bairro="${esc(p.id)}">
          <b>${esc(p.nome)}</b><span>${esc(fmt(res.a, p.a))} · ${esc(fmt(res.b, p.b))}</span></button></li>`).join('')}</ol>
        <p class="cz-dica-texto">Os mais distantes da mediana nos dois. Toque em qualquer bairro para ver os números dele.</p>`;
    }

    // Guarda o elemento com foco (pelo papel e pelo bairro) para devolver o foco depois de redesenhar.
    function chaveDoFoco() {
      const a = document.activeElement;
      if (!a || !el.contains(a)) return null;
      const css = (v) => (window.CSS && CSS.escape ? CSS.escape(v) : v);
      const cls = a.classList && a.classList[0] ? `.${a.classList[0]}` : '';
      if (a.dataset.czBairro) return `${a.tagName.toLowerCase()}${cls}[data-cz-bairro="${css(a.dataset.czBairro)}"]`;
      if (a.dataset.czPronto) return `[data-cz-pronto="${css(a.dataset.czPronto)}"]`;
      if (a.dataset.cz) return `[data-cz="${css(a.dataset.cz)}"]`;
      return null;
    }

    // ---- Escolha do indicador: campo com busca (combobox) ----
    // Botão com o indicador atual; ao abrir, um campo de busca filtra a lista (sem acento, pelo nome, pela
    // secretaria, pela fonte e pelas palavras da Maia), agrupada por secretaria. O indicador do outro eixo fica
    // desabilitado. Enquanto a lista está aberta, a tela não se redesenha (a cidade andando sozinha apagaria o que
    // a pessoa digita): o redesenho espera o fechamento.
    const norm = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
    let combo = null; // { eixo, ativo }
    let pendente = false;

    function campo(eixo, rotulo, ind) {
      return `<div class="cz-combo" data-combo="${eixo}">
        <span class="cz-combo-rotulo" id="cz-rot-${eixo}">${esc(rotulo)}</span>
        <button type="button" class="cz-combo-botao" data-cz="abrir-${eixo}" aria-haspopup="listbox" aria-expanded="false" aria-labelledby="cz-rot-${eixo} cz-val-${eixo}">
          <span id="cz-val-${eixo}">${esc(ind.nome)}</span><i class="ti ti-chevron-down" aria-hidden="true"></i>
        </button>
      </div>`;
    }

    function grupoDe(i) {
      if (!i.area) return 'Da cidade toda';
      const a = GC.data.areas.find((x) => x.id === i.area);
      return a ? a.nome : 'Outros';
    }

    // Itens que passam na busca, na ordem do catálogo, agrupados (a ordem dos grupos é a da 1ª aparição).
    function filtrar(q) {
      const termos = norm(q).split(' ').filter(Boolean);
      const lista = GC.cruzamento.indicadores().filter((i) => {
        const texto = norm([i.nome, i.curto, i.fonte, grupoDe(i), ...(i.chaves || [])].join(' '));
        return termos.every((t) => texto.includes(t));
      });
      // O catálogo intercala cidade e secretarias: junta cada grupo (sort estável, grupo pela 1ª aparição).
      const ordem = [...new Set(lista.map(grupoDe))];
      return lista.sort((x, y) => ordem.indexOf(grupoDe(x)) - ordem.indexOf(grupoDe(y)));
    }

    function marcar(nome, q) {
      const termos = norm(q).split(' ').filter(Boolean);
      if (!termos.length) return esc(nome);
      // Marca no texto original as posições que casam no texto sem acento (mesmo comprimento letra a letra).
      const base = norm(nome); const marca = Array(nome.length).fill(false);
      if (base.length === nome.length) termos.forEach((t) => { for (let p = base.indexOf(t); p >= 0; p = base.indexOf(t, p + 1)) for (let k = p; k < p + t.length; k++) marca[k] = true; });
      let out = ''; let dentro = false;
      [...nome].forEach((c, k) => {
        if (marca[k] !== dentro) { out += marca[k] ? '<mark>' : '</mark>'; dentro = marca[k]; }
        out += esc(c);
      });
      return dentro ? `${out}</mark>` : out;
    }

    function desenharLista() {
      if (!combo) return;
      const caixa = el.querySelector(`.cz-combo[data-combo="${combo.eixo}"]`);
      const ul = caixa && caixa.querySelector('.cz-combo-lista');
      const input = caixa && caixa.querySelector('.cz-combo-busca');
      if (!ul) return;
      const q = input.value;
      const atual = combo.eixo === 'a' ? res.a.id : res.b.id;
      const outro = combo.eixo === 'a' ? res.b.id : res.a.id;
      const itens = filtrar(q);
      combo.itens = itens.filter((i) => i.id !== outro).map((i) => i.id);
      if (!combo.itens.includes(combo.ativo)) combo.ativo = combo.itens.includes(atual) && !q ? atual : combo.itens[0] || null;
      if (!itens.length) {
        ul.innerHTML = `<li class="cz-combo-vazio" role="presentation">Nenhum indicador com “${esc(q)}”.</li>`;
        input.removeAttribute('aria-activedescendant');
        return;
      }
      let grupo = null;
      ul.innerHTML = itens.map((i) => {
        const g = grupoDe(i);
        const cab = g !== grupo ? `<li class="cz-combo-grupo" role="presentation">${esc(g)}</li>` : '';
        grupo = g;
        const desab = i.id === outro;
        return `${cab}<li role="option" id="cz-op-${combo.eixo}-${esc(i.id)}" data-valor="${esc(i.id)}" class="${i.id === combo.ativo ? 'ativo' : ''}" aria-selected="${i.id === atual}"${desab ? ' aria-disabled="true"' : ''}>
          <span class="cz-combo-nome">${marcar(i.nome, q)}</span>${desab ? '<small>no outro eixo</small>' : i.id === atual ? '<i class="ti ti-check" aria-hidden="true"></i>' : ''}</li>`;
      }).join('');
      if (combo.ativo) {
        input.setAttribute('aria-activedescendant', `cz-op-${combo.eixo}-${combo.ativo}`);
        const li = ul.querySelector('li.ativo');
        if (li) li.scrollIntoView({ block: 'nearest' });
      } else input.removeAttribute('aria-activedescendant');
    }

    function abrirCombo(eixo) {
      fecharCombo(false);
      const caixa = el.querySelector(`.cz-combo[data-combo="${eixo}"]`);
      if (!caixa) return;
      combo = { eixo, ativo: eixo === 'a' ? res.a.id : res.b.id };
      caixa.classList.add('aberto');
      caixa.querySelector('.cz-combo-botao').setAttribute('aria-expanded', 'true');
      caixa.insertAdjacentHTML('beforeend', `<div class="cz-combo-pop">
        <div class="cz-combo-campo"><i class="ti ti-search" aria-hidden="true"></i>
          <input type="text" class="cz-combo-busca" role="combobox" aria-expanded="true" aria-autocomplete="list" aria-controls="cz-lista-${eixo}"
            aria-labelledby="cz-rot-${eixo}" placeholder="Buscar indicador ou secretaria" autocomplete="off" spellcheck="false"></div>
        <ul class="cz-combo-lista" id="cz-lista-${eixo}" role="listbox" aria-labelledby="cz-rot-${eixo}"></ul>
      </div>`);
      desenharLista();
      caixa.querySelector('.cz-combo-busca').focus();
    }

    // devolverFoco: o foco volta ao botão do campo (Esc, escolha); clique fora não puxa o foco.
    function fecharCombo(devolverFoco) {
      if (!combo) return;
      const { eixo } = combo;
      combo = null;
      const caixa = el.querySelector(`.cz-combo[data-combo="${eixo}"]`);
      if (caixa) {
        caixa.classList.remove('aberto');
        const pop = caixa.querySelector('.cz-combo-pop');
        if (pop) pop.remove();
        const bt = caixa.querySelector('.cz-combo-botao');
        bt.setAttribute('aria-expanded', 'false');
        if (devolverFoco) bt.focus();
      }
      if (pendente) { pendente = false; desenhar(); }
    }

    function escolher(id) {
      const eixo = combo && combo.eixo;
      const outro = eixo === 'a' ? res.b.id : res.a.id;
      if (!eixo || !id || id === outro) return;
      const atual = eixo === 'a' ? res.a.id : res.b.id;
      pendente = false;
      fecharCombo(true);
      if (id !== atual) aoIr(Object.assign({}, rota, { [eixo]: id }));
    }

    el.addEventListener('input', (e) => {
      if (e.target.classList.contains('cz-combo-busca') && combo) { combo.ativo = null; desenharLista(); }
    });
    el.addEventListener('keydown', (e) => {
      if (!combo || !e.target.classList || !e.target.classList.contains('cz-combo-busca')) return;
      const l = combo.itens || [];
      const k = l.indexOf(combo.ativo);
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (!l.length) return;
        combo.ativo = l[e.key === 'ArrowDown' ? Math.min(k + 1, l.length - 1) : Math.max(k - 1, 0)];
        desenharLista();
      } else if (e.key === 'Home' || e.key === 'End') {
        if (!l.length) return;
        e.preventDefault(); combo.ativo = l[e.key === 'Home' ? 0 : l.length - 1]; desenharLista();
      } else if (e.key === 'Enter') {
        e.preventDefault(); escolher(combo.ativo);
      } else if (e.key === 'Tab') fecharCombo(false);
    });
    // Esc: com a lista aberta, limpa a busca e depois fecha a lista; com a folha do bairro aberta, fecha a folha.
    // Na captura do documento, antes do Esc geral do painel, que fecharia a tela (como em js/tela-entregas.js).
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape' || el.hidden || !el.contains(document.activeElement)) return;
      if (combo) {
        e.stopImmediatePropagation(); e.preventDefault();
        const input = el.querySelector('.cz-combo-busca');
        if (input && input.value) { input.value = ''; combo.ativo = null; desenharLista(); } else fecharCombo(true);
      } else if (sel && document.activeElement.closest('.cz-folha')) {
        e.stopImmediatePropagation(); e.preventDefault();
        sel = null; desenhar();
      }
    }, true);
    // Clique numa opção (pointerdown: antes de o campo perder o foco) e clique fora.
    el.addEventListener('pointerdown', (e) => {
      const li = e.target.closest && e.target.closest('.cz-combo-lista li[role="option"]');
      if (li) { e.preventDefault(); if (li.getAttribute('aria-disabled') !== 'true') escolher(li.dataset.valor); }
    });
    document.addEventListener('pointerdown', (e) => {
      if (combo && !(e.target.closest && e.target.closest('.cz-combo.aberto'))) fecharCombo(false);
    });

    function desenhar() {
      if (combo) { pendente = true; return; }
      const foco = chaveDoFoco();
      compacto = el.clientWidth > 0 && el.clientWidth < LARGURA_COMPACTA;
      const rot = GC.cruzamento.rotulos(res);
      const rel = relacao(res);
      const disp = dispersao(res, sel, compacto);
      const forcaPct = res.r == null ? 0 : Math.round(Math.abs(res.r) * 100);
      const t = res.tempo;
      const qtd = (n) => `${n} ${n === 1 ? 'bairro' : 'bairros'}`;
      el.innerHTML = `
        <header class="sec-topo cz-topo">
          <div><h2>📊 Cruzamento de dados</h2><p>Onde duas coisas estão ruins ao mesmo tempo, bairro a bairro. Os números são os mesmos das outras telas.</p></div>
          <span class="cz-acoes">
            <button type="button" class="btn-sec" data-cz="csv"><span aria-hidden="true">⬇</span> CSV</button>
            <button type="button" class="btn-sec btn-maia-tela" data-maia="Explique este cruzamento"><i class="ti ti-sparkles" aria-hidden="true"></i> Explicar com a Maia</button>
            <button type="button" class="btn-primario" data-cz="mapa" title="Pinta os bairros no mapa principal pelas 4 cores"><span aria-hidden="true">🗺</span> Ver no mapa</button>
          </span>
        </header>
        <div class="cz-escolha">
          <div class="cz-controles">
            ${campo('a', 'Cruzar', res.a)}
            <button type="button" class="cz-trocar" data-cz="trocar" title="Trocar os eixos" aria-label="Trocar os eixos"><i class="ti ti-arrows-left-right" aria-hidden="true"></i></button>
            ${campo('b', 'com', res.b)}
          </div>
          <div class="cz-prontos" role="group" aria-label="Cruzamentos prontos"><span class="cz-prontos-rotulo">Prontos:</span>${GC.cruzamento.prontos().map((x) => `<button type="button" data-cz-pronto="${esc(x.a)}|${esc(x.b)}" class="${x.a === res.a.id && x.b === res.b.id ? 'ativo' : ''}" aria-pressed="${x.a === res.a.id && x.b === res.b.id}">${esc(x.rotulo)}</button>`).join('')}</div>
        </div>
        <div class="cz-kpis">
          <div class="cz-kpi cz-kpi-rel">
            <small>Relação entre os dois</small><b>${esc(rel.titulo)}</b><span>${esc(rel.detalhe)}</span>
            ${res.forca.nivel === 'nd' ? '' : `<span class="cz-forca" title="Spearman ρ = ${esc(rTexto(res.r))}, pela ordem dos bairros"><span class="cz-forca-barra" aria-hidden="true"><i style="width:${forcaPct}%"></i></span>relação ${esc(res.forca.nivel === 'nenhuma' ? 'fraca demais' : res.forca.nivel)} · ${qtd(res.n)}</span>`}
          </div>
          <div class="cz-kpi"><small>Ruins nos dois</small><b>${qtd(res.grupos.ambos.length)}</b><span>do lado ruim da mediana nos dois</span></div>
          <div class="cz-kpi"><small>Fora do padrão</small><b>${qtd(res.fora.length)}</b><span>um número ruim sem o outro acompanhar</span></div>
        </div>
        <div class="cz-grade-principal">
          <section class="rel-cartao cz-cartao">
            <h3>Bairro a bairro <small>cada ponto é um bairro · área sombreada: ruim nos dois</small></h3>
            <p class="cz-legenda">${ORDEM.map((g) => `<span><i class="cz-cor cz-${g}"></i>${esc(rot[g])}</span>`).join('')}</p>
            ${disp.svg}
            ${disp.afastados || disp.temPerto ? `<p class="cz-nota cz-nota-grafico">${[
              disp.afastados ? 'Pontos lado a lado têm o mesmo valor (ou quase) e foram afastados para aparecer.' : '',
              disp.temPerto ? 'Ponto mais claro: está colado na mediana, quase do outro lado.' : '',
            ].filter(Boolean).join(' ')}</p>` : ''}
          </section>
          <section class="rel-cartao cz-cartao cz-lado">
            <h3>No mapa</h3>
            ${mapa(res, sel)}
            <div class="cz-bairro${sel ? ' com-sel' : ''}" aria-live="polite">${sel ? ficha(rot, false) : porOndeComecar()}</div>
          </section>
          <div class="cz-dica" role="tooltip" hidden></div>
        </div>
        <section class="rel-cartao cz-leitura">
          <h3>O que os números dizem</h3>
          <ul>${res.leitura.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
          <div class="cz-grupos">${ORDEM.map((g) => `<div><h4><i class="cz-cor cz-${g}"></i>${esc(rot[g])} <small>${res.grupos[g].length}</small></h4>
            <p>${res.grupos[g].map((x) => `<button type="button" class="cz-chip${x.id === sel ? ' sel' : ''}" data-cz-bairro="${esc(x.id)}" aria-pressed="${x.id === sel}">${esc(x.nome)}</button>`).join('') || '<span class="cz-nada">nenhum</span>'}</p></div>`).join('')}</div>
          <p class="cz-fontes">Fontes: ${esc(res.fontes.join(' · '))}. Contagens por mil habitantes. Grupos pelas medianas da cidade; relação de Spearman (pela ordem dos bairros)${res.r == null ? '' : `: ρ = ${esc(rTexto(res.r))}`}.</p>
        </section>
        ${t ? `<section class="rel-cartao cz-tempo">
          <h3>Na cidade, mês a mês <small>índice: ${esc(t.rotulos[0])} = 100</small></h3>
          <p class="cz-legenda"><span><i class="cz-cor cz-linha-a"></i>${esc(t.rotuloA)}</span><span><i class="cz-cor cz-linha-b"></i>${esc(t.rotuloB)}</span></p>
          ${tempo(t)}
          <p class="cz-nota">${t.r == null ? '' : `No tempo, a relação é ρ = ${rTexto(t.r)}${t.defasado ? `; com um mês de atraso no 2º, sobe para ρ = ${rTexto(t.rDefasado)}: o 2º reage depois do 1º` : ''}.`} São 12 pontos: leia como pista, não como prova. ${Math.sign(t.r || 0) !== Math.sign(res.r || 0) && Math.abs(t.r || 0) >= 0.35 && Math.abs(res.r || 0) >= 0.35 ? 'No tempo e entre bairros os sinais se invertem: o que vale para os bairros não vale para os meses.' : ''}</p>
        </section>` : ''}
        ${sel ? `<div class="cz-folha" role="region" aria-label="Bairro selecionado">${ficha(rot, true)}</div>` : ''}`;
      if (foco) { const alvo = el.querySelector(foco); if (alvo) alvo.focus({ preventScroll: true }); }
    }

    // Realce ao passar o mouse: o mesmo bairro no gráfico, no mapa e nas listas, mais a dica com os dois números.
    function realcar(id, alvo) {
      el.querySelectorAll('.hl').forEach((x) => x.classList.remove('hl'));
      const dica = el.querySelector('.cz-dica');
      if (!id) { if (dica) dica.hidden = true; return; }
      el.querySelectorAll(`[data-cz-bairro="${window.CSS && CSS.escape ? CSS.escape(id) : id}"]`).forEach((x) => x.classList.add('hl'));
      if (!dica || !alvo || !alvo.closest('svg')) return;
      const p = res.pontos.find((x) => x.id === id);
      const b = GC.data.bairros.find((x) => x.id === id);
      if (!b) return;
      const rot = GC.cruzamento.rotulos(res);
      dica.innerHTML = `<b>${esc(b.nome)}</b>${p ? `<span class="cz-tag cz-${p.grupo}">${esc(rot[p.grupo])}</span>
        <span>${esc(res.a.curto)}: <strong>${esc(fmt(res.a, p.a))}</strong></span><span>${esc(res.b.curto)}: <strong>${esc(fmt(res.b, p.b))}</strong></span>` : '<span>sem um dos dois números</span>'}`;
      const caixa = dica.parentElement.getBoundingClientRect();
      const r = (alvo.querySelector('.cz-ponto') || alvo).getBoundingClientRect();
      dica.hidden = false;
      const meia = dica.offsetWidth / 2;
      const x = Math.min(Math.max(r.left + r.width / 2 - caixa.left, meia + 4), caixa.width - meia - 4);
      dica.style.left = `${x}px`;
      dica.style.top = `${r.top - caixa.top - 8}px`;
    }

    // Cliques e teclado (um ouvinte só; o HTML é redesenhado a cada mudança).
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-cz], [data-cz-pronto], [data-cz-bairro]');
      if (!b || !res) return;
      if (b.dataset.cz === 'abrir-a' || b.dataset.cz === 'abrir-b') {
        const eixo = b.dataset.cz.slice(-1);
        if (combo && combo.eixo === eixo) fecharCombo(true); else abrirCombo(eixo);
        return;
      }
      if (b.dataset.czBairro) { sel = sel === b.dataset.czBairro ? null : b.dataset.czBairro; desenhar(); return; }
      if (b.dataset.czPronto) { const [a, bb] = b.dataset.czPronto.split('|'); aoIr(Object.assign({}, rota, { a, b: bb })); return; }
      if (b.dataset.cz === 'fechar') { sel = null; desenhar(); return; }
      if (b.dataset.cz === 'trocar') aoIr(Object.assign({}, rota, { a: res.b.id, b: res.a.id }));
      if (b.dataset.cz === 'mapa') aoVerNoMapa(GC.cruzamento.mapa(res));
      if (b.dataset.cz === 'mapa-bairro' && sel) aoVerNoMapa({ tipo: 'destaque', bairros: [sel], legenda: `${res.a.curto} e ${res.b.curto}` });
      if (b.dataset.cz === 'csv') aoBaixar(csv(), `cruzamento-${res.a.id}-${res.b.id}.csv`);
    });
    el.addEventListener('keydown', (e) => {
      const g = e.target.closest && e.target.closest('g[data-cz-bairro]');
      if (g && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); g.dispatchEvent(new MouseEvent('click', { bubbles: true })); }    });
    el.addEventListener('pointerover', (e) => {
      if (e.pointerType === 'touch' || !res) return;
      const b = e.target.closest('[data-cz-bairro]');
      realcar(b ? b.dataset.czBairro : null, b);
    });
    el.addEventListener('pointerleave', () => realcar(null));
    el.addEventListener('focusin', (e) => {
      const g = e.target.closest && e.target.closest('g[data-cz-bairro]');
      if (g && res) realcar(g.dataset.czBairro, g);
    });
    el.addEventListener('focusout', () => realcar(null));
    // Passou da largura compacta (girar o celular, abrir a Maia ao lado): redesenha nas outras medidas.
    if (window.ResizeObserver) {
      new ResizeObserver(() => {
        if (!res || !el.clientWidth) return;
        if ((el.clientWidth < LARGURA_COMPACTA) !== compacto) desenhar();
      }).observe(el);
    }

    return {
      // rota: { tela: 'cruzamento', a, b }; ctx: { ocorrencias, areas } (o recorte do perfil).
      mostrar(r, ctx) {
        const ok = GC.cruzamento.indicadores().map((i) => i.id);
        const padrao = GC.cruzamento.prontos()[0] || { a: ok[0], b: ok[1] };
        const a = ok.includes(r.a) ? r.a : padrao.a;
        let b = ok.includes(r.b) ? r.b : padrao.b;
        if (b === a) b = ok.find((x) => x !== a);
        if (!rota || rota.a !== a || rota.b !== b) sel = null;
        rota = { tela: 'cruzamento', a, b };
        res = GC.cruzamento.cruzar(a, b, ctx);
        // Rota nova (atalho, Maia, voltar) vale mais que uma lista aberta: fecha sem esperar.
        combo = null; pendente = false;
        desenhar();
      },
      atualizar(ctx) { if (rota) { res = GC.cruzamento.cruzar(rota.a, rota.b, ctx); desenhar(); } },
      resultado: () => res,
    };
  };
})(window.GC = window.GC || {});
