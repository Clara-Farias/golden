(function (GC) {
  // Maia no Portal do Cidadão: o botão flutuante (#p-maia-abrir) abre uma conversa em que o morador pede um
  // reparo (buraco, poste apagado, árvore, entulho, vazamento, bueiro) ou acompanha um pedido. É roteirizada,
  // como a Maia do painel: o texto livre só serve para achar o tipo, o bairro, o protocolo ou a descrição.
  // O pedido sai pelo MESMO registro do formulário (GC.pedidos: abrir, reforcar, perto), com protocolo,
  // "também vi isso" e a Prefeitura simulada de js/portal-pedidos.js. O nome e a cor da assistente seguem a
  // Personalização (o "Maia" do texto é trocado por js/personalizacao.js).

  const sem = (t) => String(t == null ? '' : t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  // Palavras de cada tipo de pedido (sem acento, pedaço de palavra vale).
  GC.PALAVRAS_PEDIDO_MAIA = {
    buraco: ['buraco', 'cratera', 'asfalto', 'pavimento', 'esburacad', 'remendo', 'calcamento', 'paralelepipedo'],
    iluminacao: ['poste', 'lampada', 'iluminacao', 'luz apagada', 'luz queimada', 'rua escura', 'sem luz', 'apagad', 'escuridao'],
    arvore: ['arvore', 'galho', 'poda', 'podar', 'tronco', 'raiz'],
    entulho: ['entulho', 'lixo', 'sujeira', 'descarte', 'sofa', 'movel', 'moveis', 'cacamba', 'mato', 'terreno sujo'],
    vazamento: ['vazamento', 'vazando', 'vaza', 'cano', 'agua jorrando', 'agua escorrendo', 'adutora', 'hidrometro'],
    bueiro: ['bueiro', 'boca de lobo', 'boca-de-lobo', 'entupid', 'alagando', 'galeria', 'esgoto'],
  };
  // Emergência não é pedido: a Maia manda ligar.
  const EMERGENCIA = ['incendio', 'fogo', 'pegando fogo', 'ferid', 'acidente', 'desab', 'afogad', 'socorro', 'choque', 'fio caido', 'fio partido', 'soterr', 'deslizamento'];
  const ACOMPANHAR = ['acompanhar', 'protocolo', 'meu pedido', 'meus pedidos', 'situacao do', 'andamento', 'ja pedi', 'status'];
  const CANCELAR = ['cancelar', 'desistir', 'recomecar', 'comecar de novo', 'deixa pra la', 'esquece'];
  const SAUDACAO = ['oi', 'ola', 'bom dia', 'boa tarde', 'boa noite', 'e ai', 'opa'];
  const PROTOCOLO = /\b(\d{4})\s*[-./]?\s*(\d{4,6})\b/;
  const temAlguma = (t, lista) => lista.some((p) => t.indexOf(p) >= 0);
  const palavraInteira = (t, p) => new RegExp(`(^|[^a-z0-9])${p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`).test(t);

  // O que o morador escreveu: { intencao, tipo, bairroId, protocolo }. Só lógica (os testes chamam direto).
  // intencao: 'emergencia' | 'cancelar' | 'acompanhar' | 'pedido' | 'saudacao' | null (não entendi).
  GC.entenderPedidoMaia = function (texto, { bairros } = {}) {
    const t = sem(texto).replace(/\s+/g, ' ').trim();
    const lista = bairros || (GC.data && GC.data.bairros) || [];
    // Bairro: o nome mais comprido que aparece inteiro ("Vila Nova" antes de "Nova").
    const bairro = lista.slice().sort((a, b) => b.nome.length - a.nome.length).find((b) => palavraInteira(t, sem(b.nome)));
    // Tipo: o que tem mais palavras no texto; empate, a ordem de GC.TIPOS_PEDIDO.
    let tipo = null;
    let melhor = 0;
    (GC.TIPOS_PEDIDO || []).forEach((tp) => {
      const n = (GC.PALAVRAS_PEDIDO_MAIA[tp.id] || []).filter((p) => t.indexOf(p) >= 0).length;
      if (n > melhor) { melhor = n; tipo = tp.id; }
    });
    const m = t.match(PROTOCOLO);
    const protocolo = m ? `${m[1]}-${m[2].padStart(6, '0')}` : null;
    let intencao = null;
    if (temAlguma(t, EMERGENCIA)) intencao = 'emergencia';
    else if (temAlguma(t, CANCELAR)) intencao = 'cancelar';
    else if (protocolo || (!tipo && temAlguma(t, ACOMPANHAR))) intencao = 'acompanhar';
    else if (tipo || /\b(reparo|conserto|consertar|arrumar|pedido|pedir|reclama)/.test(t)) intencao = 'pedido';
    else if (SAUDACAO.some((s) => palavraInteira(t, s))) intencao = 'saudacao';
    return { intencao, tipo, bairroId: bairro ? bairro.id : null, protocolo };
  };

  // ---------- conversa (DOM) ----------
  // ctx: { $, esc, ic, store, toast, bairroAtual, aoMudar }
  GC.criarMaiaPortal = function (ctx) {
    const { $, esc, ic, store, toast } = ctx;
    const pd = GC.pedidos;
    const painel = $('p-maia');
    const abrirBtn = $('p-maia-abrir');
    if (!painel || !abrirBtn || !pd) return null;
    const log = $('p-maia-log');
    const formTexto = $('p-maia-form');
    const campo = $('p-maia-campo');
    const arquivo = $('p-maia-foto');
    const bairroDe = (id) => GC.data.bairros.find((b) => b.id === id) || { id, nome: id, centro: GC.data.bairros[0].centro };
    const tipoDe = (id) => GC.tipoPedido(id) || { nome: id, icone: 'tool' };
    const relatosTxt = (n) => (n > 1 ? `${n} moradores já relataram` : '1 morador já relatou');
    const tel = () => GC.telefonePrefeitura ? GC.telefonePrefeitura() : '156';
    const telLink = () => `<a href="tel:${esc(tel().replace(/[^\d+]/g, ''))}"><b>${esc(tel())}</b></a>`;

    let c = null; // a conversa: { passo, tipo, lat, lng, bairroId, perto, reforco, descricao, foto }
    let mini = null;
    let iniciada = false;
    let voltarFoco = null;

    // ---------- mensagens ----------
    function rolar() { requestAnimationFrame(() => { log.scrollTop = log.scrollHeight; }); }
    function apagarOpcoes() { log.querySelectorAll('.pm-opcoes').forEach((o) => o.remove()); }
    // Fala da Maia: html do texto e, opcionalmente, botões ({ rotulo, icone, fazer, sec }) e um extra (mapa, cartão).
    function maia(html, { opcoes = [], extra = '' } = {}) {
      const li = document.createElement('li');
      li.className = 'pm-msg pm-dela';
      li.innerHTML = `<span class="maia-rosto" aria-hidden="true"></span><div class="pm-balao">${html}${extra}</div>`;
      if (opcoes.length) {
        const caixa = document.createElement('div');
        caixa.className = 'pm-opcoes';
        opcoes.forEach((o) => {
          const b = document.createElement(o.href ? 'a' : 'button');
          if (o.href) b.href = o.href; else b.type = 'button';
          b.className = `pm-opcao${o.sec ? ' sec' : ''}`;
          b.innerHTML = `${o.icone ? ic(o.icone) : ''}<span>${esc(o.rotulo)}</span>`;
          b.addEventListener('click', (e) => {
            if (o.href) { fechar({ semFoco: true }); return; }
            e.preventDefault();
            // fica: o botão não encerra a pergunta (abrir a câmera, que a pessoa pode cancelar).
            if (o.fica) { o.fazer(); return; }
            apagarOpcoes();
            if (!o.calado) eu(o.rotulo);
            o.fazer();
          });
          caixa.appendChild(b);
        });
        li.querySelector('.pm-balao').appendChild(caixa);
      }
      log.appendChild(li);
      rolar();
      return li;
    }
    function eu(texto, foto) {
      const li = document.createElement('li');
      li.className = 'pm-msg pm-minha';
      li.innerHTML = `<div class="pm-balao">${foto ? `<img src="${esc(foto)}" alt="Sua foto do problema">` : ''}${texto ? esc(texto) : ''}</div>`;
      log.appendChild(li);
      rolar();
    }
    function soltarMapa() { if (mini) { try { mini.remover(); } catch (e) { /* já saiu */ } mini = null; } }

    // ---------- roteiro ----------
    const opcoesTipos = () => GC.TIPOS_PEDIDO.map((t) => ({ rotulo: t.nome, icone: t.icone, fazer: () => escolherTipo(t.id) }));
    function boasVindas() {
      c = null;
      const meus = pd.meus().length;
      maia(`<p>Oi! Sou a Maia, assistente da Prefeitura. Posso abrir um pedido de reparo para você ou dizer como anda um pedido seu.</p><p>Conte o que aconteceu, por exemplo: <i>“tem um buraco grande na rua do Centro”</i>. Ou escolha abaixo.</p>`,
        { opcoes: [...opcoesTipos(), { rotulo: meus ? `Meus pedidos (${meus})` : 'Acompanhar um pedido', icone: 'clipboard-list', sec: true, fazer: acompanhar }] });
    }
    function escolherTipo(tipo, bairroId) {
      const b = bairroDe(bairroId || (c && c.bairroId) || ctx.bairroAtual() || GC.data.bairros[0].id);
      c = { passo: 'onde', tipo, lat: b.centro[0], lng: b.centro[1], bairroId: b.id, perto: null, reforco: false, descricao: '', foto: null, bairroDito: !!bairroId };
      perguntarOnde();
    }
    function perguntarOnde() {
      soltarMapa();
      const tp = tipoDe(c.tipo);
      const comMapa = !!(GC.criarMapaCidadao && window.maplibregl);
      const texto = `<p>${ic(tp.icone)} <b>${esc(tp.nome)}</b>. Onde é?</p><p>${comMapa ? 'Arraste o alfinete até o lugar exato ou toque no mapa. Também pode me dizer o bairro.' : 'Me diga o bairro ou use a sua localização.'}</p>`;
      const li = maia(texto, {
        extra: comMapa ? '<div class="pm-mapa" role="region" aria-label="Mapa para marcar o lugar do problema"></div><p class="pm-onde" aria-live="polite"></p>' : '<p class="pm-onde" aria-live="polite"></p>',
        opcoes: [
          { rotulo: 'É aqui', icone: 'map-pin-check', fazer: confirmarLugar },
          { rotulo: 'Usar minha localização', icone: 'current-location', sec: true, calado: true, fazer: usarLocalizacao },
        ],
      });
      mostrarOnde(li);
      const caixa = li.querySelector('.pm-mapa');
      if (caixa) {
        mini = GC.criarMapaCidadao(caixa, { aoClicar: (p) => mover(p.lat, p.lng, false), areasRisco: [] }) || null;
        if (mini) {
          mini.alfinete(c.lat, c.lng, (p) => mover(p.lat, p.lng, false));
          setTimeout(() => { if (mini) { mini.redimensionar(); mini.centrar(c.lat, c.lng, 15); } }, 60);
        } else caixa.remove();
      }
    }
    function mostrarOnde(li) {
      const alvo = (li || log).querySelectorAll('.pm-onde');
      const el = alvo[alvo.length - 1];
      if (el) el.innerHTML = `${ic('map-pin')} ${esc(bairroDe(c.bairroId).nome)}`;
    }
    function mover(lat, lng, voar) {
      const b = GC.bairroDoPonto ? GC.bairroDoPonto(lat, lng) : null;
      if (!b) { toast('Esse ponto fica fora da cidade. Marque um lugar dentro de um bairro.'); if (mini) mini.alfinete(c.lat, c.lng, (p) => mover(p.lat, p.lng, false)); return; }
      Object.assign(c, { lat, lng, bairroId: b });
      if (mini) { mini.alfinete(lat, lng, (p) => mover(p.lat, p.lng, false)); if (voar) mini.centrar(lat, lng, 16); }
      mostrarOnde();
    }
    function usarLocalizacao() {
      if (!navigator.geolocation) { maia('<p>Este navegador não informa a localização. Marque no mapa ou me diga o bairro.</p>', { opcoes: opcoesOnde() }); return; }
      navigator.geolocation.getCurrentPosition((pos) => {
        const b = GC.bairroDoPonto(pos.coords.latitude, pos.coords.longitude);
        if (!b) { maia('<p>Pela sua localização, você está fora da cidade. Marque no mapa o lugar do problema ou me diga o bairro.</p>', { opcoes: opcoesOnde() }); return; }
        mover(pos.coords.latitude, pos.coords.longitude, true);
        maia(`<p>Achei você no bairro <b>${esc(bairroDe(b).nome)}</b>. Se precisar, ajuste o alfinete no mapa.</p>`, { opcoes: opcoesOnde() });
      }, () => maia('<p>Não consegui usar a localização. Marque no mapa ou me diga o bairro.</p>', { opcoes: opcoesOnde() }), { timeout: 10000, maximumAge: 300000 });
    }
    const opcoesOnde = () => [{ rotulo: 'É aqui', icone: 'map-pin-check', fazer: confirmarLugar }];
    function confirmarLugar() {
      if (!GC.bairroDoPonto(c.lat, c.lng)) { maia('<p>Esse ponto fica fora da cidade. Marque um lugar dentro de um bairro.</p>', { opcoes: opcoesOnde() }); return; }
      soltarMapa();
      // O mapa congela: o alfinete do balão anterior não muda mais o pedido.
      log.querySelectorAll('.pm-mapa').forEach((m) => { m.classList.add('pm-mapa-feito'); m.innerHTML = `<span>${ic('map-pin-filled')} ${esc(bairroDe(c.bairroId).nome)}</span>`; });
      c.perto = pd.perto(c.tipo, c.lat, c.lng, store.ocorrencias());
      if (c.perto) perguntarSeEhOMesmo(); else pedirDetalhes();
    }
    function perguntarSeEhOMesmo() {
      c.passo = 'existe';
      const x = c.perto;
      const p = x.ponto;
      const situacao = p ? `${GC.SITUACOES_PEDIDO[p.situacao]} · ${p.detalhe || ''}` : ((GC.situacaoDoPedido(x.ocorrencia) || {}).detalhe || 'Em atendimento');
      const quem = p && p.relatos ? `${relatosTxt(p.relatos)} um problema assim` : 'A Prefeitura já está cuidando de um problema assim';
      maia(`<p>${esc(quem)}, a ${x.distanciaM} m do ponto que você marcou. Situação: <b>${esc(situacao)}</b>.</p><p>É o mesmo? Se for, o seu relato soma aos outros e ajuda a mostrar a urgência.</p>`, {
        opcoes: [
          { rotulo: 'É o mesmo, também vi', icone: 'thumb-up', fazer: () => { c.reforco = true; pedirDetalhes(); } },
          { rotulo: 'É outro problema', sec: true, fazer: () => { c.reforco = false; c.perto = null; pedirDetalhes(); } },
        ],
      });
    }
    function pedirDetalhes() {
      c.passo = 'detalhes';
      maia(`<p>${c.reforco ? 'Quer acrescentar algo?' : 'Conte um pouco mais.'} Um ponto de referência ou uma foto ajudam a equipe a chegar preparada. As duas coisas são opcionais.</p><p class="pm-dica">${ic('lock')} Não fotografe pessoas nem placas de carro.</p>`, {
        opcoes: [
          fotoOpcao(),
          { rotulo: 'Pular', icone: 'arrow-right', sec: true, fazer: resumir },
        ],
      });
      campo.placeholder = 'Ex.: em frente ao número 120, perto da padaria';
      campo.focus({ preventScroll: true });
    }
    const fotoOpcao = () => ({ rotulo: 'Mandar uma foto', icone: 'camera', sec: true, fica: true, fazer: () => { arquivo.value = ''; arquivo.click(); } });
    // Depois da foto ou do ponto de referência: o que já veio e o que ainda dá para mandar.
    function repetirDetalhes() {
      const texto = c.foto && c.descricao ? 'Anotei a foto e o ponto de referência.'
        : c.foto ? 'Foto recebida. Quer escrever um ponto de referência? Se não, é só seguir.'
          : c.descricao ? 'Anotei. Quer mandar uma foto também?' : 'Pode escrever um ponto de referência aqui embaixo, mandar uma foto ou seguir sem.';
      maia(`<p>${texto}</p>`, {
        opcoes: [
          ...(c.foto ? [] : [fotoOpcao()]),
          { rotulo: c.foto || c.descricao ? 'Seguir' : 'Pular', icone: 'arrow-right', sec: true, fazer: resumir },
        ],
      });
    }
    function resumir() {
      c.passo = 'confirmar';
      campo.placeholder = 'Escreva aqui';
      const tp = tipoDe(c.tipo);
      const cartao = `<dl class="pm-resumo">
          <div><dt>O quê</dt><dd>${ic(tp.icone)} ${esc(tp.nome)}${c.reforco ? ' (mesmo problema já relatado)' : ''}</dd></div>
          <div><dt>Onde</dt><dd>${esc(bairroDe(c.bairroId).nome)}</dd></div>
          ${c.descricao ? `<div><dt>Detalhe</dt><dd>${esc(c.descricao)}</dd></div>` : ''}
          ${c.foto ? `<div><dt>Foto</dt><dd><img src="${esc(c.foto)}" alt="Foto do problema"></dd></div>` : ''}
        </dl>`;
      maia('<p>Confere o pedido antes de enviar:</p>', {
        extra: cartao,
        opcoes: [
          { rotulo: 'Enviar pedido', icone: 'send', fazer: enviar },
          { rotulo: 'Mudar o lugar', icone: 'map-pin', sec: true, fazer: () => { c.passo = 'onde'; c.perto = null; c.reforco = false; perguntarOnde(); } },
          { rotulo: 'Cancelar', sec: true, fazer: cancelar },
        ],
      });
    }
    const MOTIVOS = { foto: 'Esse arquivo não é uma imagem.', foto_grande: 'A foto ficou grande demais.', fora: 'Esse ponto fica fora da cidade.', local: 'Falta marcar o lugar no mapa.', estado: 'Esse problema já foi resolvido.', tipo: 'Falta escolher o tipo de problema.' };
    function enviar() {
      const dados = { tipo: c.tipo, lat: c.lat, lng: c.lng, bairroId: c.bairroId, descricao: c.descricao, foto: c.foto };
      const x = c.perto;
      let r;
      if (c.reforco && x && x.ponto) r = pd.reforcar(x.ponto.id, dados);
      else if (c.reforco && x && x.ocorrencia) r = pd.abrir(Object.assign(dados, { ocorrencia: x.ocorrencia }));
      else r = pd.abrir(dados);
      if (!r.ok) {
        maia(`<p>Não deu para enviar. ${esc(MOTIVOS[r.motivo] || 'Tente de novo.')}</p>`, { opcoes: [{ rotulo: 'Tentar de novo', icone: 'refresh', fazer: enviar }, { rotulo: 'Começar de novo', sec: true, fazer: boasVindas }] });
        return;
      }
      const proto = r.pedido.protocolo;
      const reforco = c.reforco;
      c = null;
      maia(`<p>${reforco ? 'Pronto, o seu relato foi somado aos outros deste problema.' : 'Pronto, a Prefeitura recebeu o seu pedido.'}</p>`, {
        extra: `<p class="pm-protocolo"><small>Protocolo</small><b>${esc(proto)}</b></p><p class="pm-dica">Fica salvo em “Meus pedidos” neste aparelho. Eu aviso aqui quando a situação mudar.</p>`,
        opcoes: [
          { rotulo: 'Acompanhar o pedido', icone: 'arrow-right', href: `#/pedidos/${encodeURIComponent(proto)}` },
          { rotulo: 'Copiar protocolo', icone: 'copy', sec: true, calado: true, fazer: () => copiar(proto) },
          { rotulo: 'Pedir outro reparo', icone: 'plus', sec: true, fazer: () => maia('<p>Qual é o problema?</p>', { opcoes: opcoesTipos() }) },
        ],
      });
      vigiar(proto);
      ctx.aoMudar();
    }
    async function copiar(proto) {
      try { await navigator.clipboard.writeText(proto); toast('Protocolo copiado.'); } catch (e) { toast(`Anote o protocolo: ${proto}`); }
      maia('<p>Precisa de mais alguma coisa?</p>', { opcoes: [{ rotulo: 'Acompanhar o pedido', icone: 'arrow-right', href: `#/pedidos/${encodeURIComponent(proto)}` }, { rotulo: 'Pedir outro reparo', icone: 'plus', sec: true, fazer: () => maia('<p>Qual é o problema?</p>', { opcoes: opcoesTipos() }) }] });
    }
    function cancelar() {
      soltarMapa();
      c = null;
      maia('<p>Tudo bem, nada foi enviado. Se precisar, é só chamar.</p>', { opcoes: [{ rotulo: 'Pedir um reparo', icone: 'tool', sec: true, fazer: () => maia('<p>Qual é o problema?</p>', { opcoes: opcoesTipos() }) }] });
    }

    // ---------- acompanhar ----------
    function htmlSituacao(m) {
      const p = m.ponto;
      return `<a class="pm-pedido" href="#/pedidos/${encodeURIComponent(m.protocolo)}">${ic(tipoDe(p.tipo).icone)}<span><b>${esc(tipoDe(p.tipo).nome)} · ${esc(bairroDe(p.bairroId).nome)}</b><small>Protocolo ${esc(m.protocolo)}</small></span><span class="pp-chip ${esc(p.situacao)}">${esc(GC.SITUACOES_PEDIDO[p.situacao])}</span></a>`;
    }
    function acompanhar(protocolo) {
      c = null;
      if (protocolo) {
        const m = pd.doProtocolo(protocolo);
        if (!m) { maia(`<p>Não achei nenhum pedido com o protocolo <b>${esc(protocolo)}</b>. Confira o número e me mande de novo.</p>`); return; }
        const p = m.ponto;
        maia(`<p>${esc(GC.SITUACOES_PEDIDO[p.situacao])}: ${esc(p.detalhe || '')}. ${esc(relatosTxt(p.relatos).replace(' já ', ' '))} este problema.</p>`, { extra: htmlSituacao(m) });
        return;
      }
      const meus = pd.meus();
      if (!meus.length) { maia('<p>Não há pedidos feitos neste aparelho. Se você tem o número do protocolo, escreva aqui embaixo (ex.: 2026-004812).</p>'); return; }
      maia(`<p>${meus.length > 1 ? `Os seus ${Math.min(meus.length, 4)} pedidos mais recentes:` : 'O seu pedido:'}</p>`, {
        extra: `<div class="pm-pedidos">${meus.slice(0, 4).map(htmlSituacao).join('')}</div>`,
        opcoes: [{ rotulo: 'Ver todos', icone: 'clipboard-list', sec: true, href: '#/pedidos' }],
      });
    }
    // Avisa na conversa quando um pedido feito aqui muda de situação (a Prefeitura simulada ou o painel).
    const vigiados = new Map(); // protocolo → situação vista
    function vigiar(proto) { const m = pd.doProtocolo(proto); if (m) vigiados.set(proto, m.ponto.situacao); }
    pd.assinar(() => {
      vigiados.forEach((antes, proto) => {
        const m = pd.doProtocolo(proto);
        if (!m || m.ponto.situacao === antes) return;
        vigiados.set(proto, m.ponto.situacao);
        if (m.ponto.situacao === 'resolvido') vigiados.delete(proto);
        maia(`<p>Novidade no protocolo <b>${esc(proto)}</b>: ${esc(GC.SITUACOES_PEDIDO[m.ponto.situacao])}. ${esc(m.ponto.detalhe || '')}.</p>`, { extra: htmlSituacao(m) });
        if (painel.hidden) abrirBtn.classList.add('pm-novidade');
      });
    });

    // ---------- texto livre ----------
    function responder(texto) {
      const e = GC.entenderPedidoMaia(texto);
      if (e.intencao === 'emergencia') {
        maia('<p><b>Se alguém corre perigo, ligue agora:</b> Bombeiros <a href="tel:193"><b>193</b></a>, SAMU <a href="tel:192"><b>192</b></a>, Defesa Civil <a href="tel:199"><b>199</b></a>. Não chegue perto de fios caídos.</p><p>Depois, se quiser, eu abro um pedido de reparo.</p>');
        return;
      }
      if (e.intencao === 'cancelar') { if (c) cancelar(); else maia('<p>Tudo bem. Se precisar, é só chamar.</p>'); return; }
      // No meio de um pedido, o texto vale para o passo da vez.
      if (c && c.passo === 'detalhes') {
        c.descricao = String(texto).slice(0, GC.MAX_DESCRICAO_PEDIDO);
        repetirDetalhes();
        return;
      }
      if (c && c.passo === 'onde' && e.bairroId && !e.tipo) {
        const b = bairroDe(e.bairroId);
        mover(b.centro[0], b.centro[1], true);
        maia(`<p>Levei o alfinete para o bairro <b>${esc(b.nome)}</b>. Ajuste no mapa até o lugar exato, se puder.</p>`, { opcoes: opcoesOnde() });
        return;
      }
      if (e.intencao === 'acompanhar') { acompanhar(e.protocolo); return; }
      if (e.tipo) {
        if (c && c.tipo === e.tipo && c.passo === 'onde') { maia('<p>Certo. Marque o lugar no mapa e toque em “É aqui”.</p>', { opcoes: opcoesOnde() }); return; }
        escolherTipo(e.tipo, e.bairroId);
        return;
      }
      if (e.intencao === 'pedido') { maia('<p>Qual é o problema?</p>', { opcoes: opcoesTipos() }); return; }
      if (e.intencao === 'saudacao') { maia('<p>Oi! Me conte o que aconteceu ou escolha um tipo de reparo.</p>', { opcoes: opcoesTipos() }); return; }
      maia(`<p>Por aqui eu abro pedidos de reparo e acompanho os seus pedidos. Para outros assuntos, ligue ${telLink()}.</p>`, { opcoes: [...opcoesTipos(), { rotulo: 'Acompanhar um pedido', icone: 'clipboard-list', sec: true, fazer: acompanhar }] });
    }
    formTexto.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const t = campo.value.trim();
      if (!t) return;
      campo.value = '';
      apagarOpcoes();
      eu(t);
      setTimeout(() => responder(t), 250);
    });
    arquivo.addEventListener('change', async () => {
      const arq = arquivo.files && arquivo.files[0];
      if (!arq || !c) return;
      try {
        c.foto = await GC.reduzirFotoPedido(arq);
        apagarOpcoes();
        eu('', c.foto);
        repetirDetalhes();
      } catch (e) { maia('<p>Não consegui ler essa foto. Tente outra.</p>'); }
    });

    // ---------- abrir e fechar ----------
    function abrir() {
      voltarFoco = document.activeElement;
      painel.hidden = false;
      document.body.classList.add('p-com-maia');
      abrirBtn.setAttribute('aria-expanded', 'true');
      abrirBtn.classList.remove('pm-novidade');
      if (!iniciada) { iniciada = true; boasVindas(); }
      rolar();
      setTimeout(() => campo.focus({ preventScroll: true }), 50);
    }
    function fechar({ semFoco = false } = {}) {
      if (painel.hidden) return;
      painel.hidden = true;
      document.body.classList.remove('p-com-maia');
      abrirBtn.setAttribute('aria-expanded', 'false');
      if (!semFoco && voltarFoco && voltarFoco.focus) voltarFoco.focus({ preventScroll: true });
    }
    abrirBtn.addEventListener('click', () => (painel.hidden ? abrir() : fechar()));
    $('p-maia-fechar').addEventListener('click', () => fechar());
    painel.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); fechar(); } });

    return { abrir, fechar, aberta: () => !painel.hidden };
  };
})(window.GC = window.GC || {});
