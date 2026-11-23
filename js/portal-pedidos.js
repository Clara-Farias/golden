(function (GC) {
  // Pedidos no Portal do Cidadão (spec: docs/specs/2026-11-12-vila-dourada-pedido-do-cidadao-design.md).
  // Telas: #/pedir[/<tipo>] (formulário em passos: onde → já existe? → foto e descrição → protocolo),
  // #/pedidos (meus pedidos e busca por protocolo) e #/pedidos/<protocolo> (situação, linha do tempo e avaliação).
  // Tudo mora na seção #aba-pedidos de cidadao.html (a folha por cima da página); js/portal-cidadao.js chama GC.criarPortalPedidos.
  // Sem painel aberto (presença em gc.presenca.<cidade>.painel), a Prefeitura simulada atende o pedido aqui.
  const PRESENCA_VALE_MS = 45000;
  // Prefeitura simulada: segundos em cada passo (tempo comprimido para a demonstração).
  const PASSOS_SIMULADOS = [
    { de: 'recebido', apos: 4, para: 'encaminhado', detalhe: (sec) => `Na fila da ${sec}` },
    { de: 'encaminhado', apos: 15, para: 'encaminhado', detalhe: () => 'Equipe a caminho', so: (p) => /^Na fila/.test(p.detalhe || '') },
    { de: 'encaminhado', apos: 20, para: 'em_campo', detalhe: () => 'Equipe no local', so: (p) => p.detalhe === 'Equipe a caminho' },
    { de: 'em_campo', apos: 30, para: 'resolvido', detalhe: () => 'Serviço feito' },
  ];
  const EVIDENCIA_SIMULADA = {
    buraco: 'Buraco tapado com asfalto a frio e trecho sinalizado até secar.',
    iluminacao: 'Lâmpada e reator trocados; poste aceso de novo.',
    arvore: 'Galhos retirados e fiação liberada; a poda completa foi agendada.',
    entulho: 'Entulho recolhido e calçada liberada.',
    vazamento: 'Vazamento consertado pela companhia de saneamento.',
    bueiro: 'Bueiro desobstruído e grade recolocada.',
  };
  const FOTO_LADO = 640;
  // Foto reduzida no canvas (lado maior 640 px, JPEG): cabe no registro do aparelho. A Maia do portal também usa.
  GC.reduzirFotoPedido = function (arquivo) {
    return new Promise((resolve, reject) => {
      const leitor = new FileReader();
      leitor.onerror = reject;
      leitor.onload = () => {
        const img = new Image();
        img.onerror = reject;
        img.onload = () => {
          const k = Math.min(1, FOTO_LADO / Math.max(img.width, img.height));
          const c = document.createElement('canvas');
          c.width = Math.round(img.width * k);
          c.height = Math.round(img.height * k);
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          let url = c.toDataURL('image/jpeg', 0.6);
          if (url.length * 0.75 > GC.FOTO_PEDIDO_MAX_BYTES) url = c.toDataURL('image/jpeg', 0.4);
          resolve(url);
        };
        img.src = leitor.result;
      };
      leitor.readAsDataURL(arquivo);
    });
  };

  GC.criarPortalPedidos = function (ctx) {
    const { $, esc, ic, store, toast, irPara } = ctx;
    const pd = GC.pedidos;
    const cidade = GC.cidade ? GC.cidade.id : 'media';
    const bairroDe = (id) => GC.data.bairros.find((b) => b.id === id) || { nome: id, centro: null };
    const sec = (area) => ((GC.data.areas.find((a) => a.id === area) || {}).secretaria || { nome: 'Prefeitura' }).nome;
    const quando = (t) => new Date(t).toLocaleString('pt-BR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    const relatosTxt = (n) => (n > 1 ? `${n} moradores relataram` : '1 morador relatou');
    const el = () => $('aba-pedidos');
    let rota = [];
    let form = null; // { tipo, passo, lat, lng, bairroId, perto, descricao, foto, erro, enviado }
    let mini = null; // mapa do formulário
    let buscaProto = '';

    const painelAberto = () => { try { return Date.now() - Number(localStorage.getItem(`gc.presenca.${cidade}.painel`) || 0) < PRESENCA_VALE_MS; } catch (e) { return false; } };

    // ---------- pedaços ----------
    const chip = (p) => `<span class="pp-chip ${esc(p.situacao)}">${esc(GC.SITUACOES_PEDIDO[p.situacao])}</span>`;
    function htmlPassos(p) {
      const ordem = Object.keys(GC.SITUACOES_PEDIDO);
      // Resolvido: todos os passos feitos (o último também ganha o check).
      const k = p.situacao === 'resolvido' ? ordem.length : ordem.indexOf(p.situacao);
      // Rota tracejada (manual, recursos de apoio): o trecho percorrido é contínuo, o que falta é tracejado e, com a
      // equipe em campo, o tracejado do próximo trecho anda (movimento.md, item 6).
      const rota = (i) => (i ? `<svg class="pp-rota${i <= k ? ' feita' : ''}${p.situacao === 'em_campo' && i === k + 1 ? ' anda' : ''}" aria-hidden="true" focusable="false"><line x1="0" y1="50%" x2="100%" y2="50%"/></svg>` : '');
      return `<ol class="pp-passos" aria-label="Situação do pedido">${ordem.map((s, i) => `<li class="${i < k ? 'feito' : i === k ? 'agora' : ''}"${i === k ? ' aria-current="step"' : ''}>${rota(i)}<span aria-hidden="true">${i < k ? ic('check') : i + 1}</span>${esc(GC.SITUACOES_PEDIDO[s])}</li>`).join('')}</ol>`;
    }
    const tipoNome = (id) => (GC.tipoPedido(id) || { nome: id }).nome;
    const tipoIcone = (id) => (GC.tipoPedido(id) || { icone: 'tool' }).icone;
    function htmlItemMeu(m) {
      const p = m.ponto;
      const avaliar = p.situacao === 'resolvido' && !m.avaliacao;
      return `<li><a class="pp-item" href="#/pedidos/${esc(m.protocolo)}">
        <span class="pp-item-ic">${ic(tipoIcone(p.tipo))}</span>
        <span class="pp-item-txt"><b>${esc(tipoNome(p.tipo))} · ${esc(bairroDe(p.bairroId).nome)}</b><small>Protocolo ${esc(m.protocolo)} · ${esc(quando(m.criadoEm))}</small>
          <small>${esc(p.detalhe || '')}${avaliar ? ' · <strong class="pp-avaliar">Avalie o atendimento</strong>' : ''}</small></span>
        ${chip(p)}</a></li>`;
    }

    // Serviços: os tipos abrem o formulário; o telefone continua para quem prefere ligar.
    function htmlServicos() {
      const tel = GC.telefonePrefeitura();
      const meus = pd.meus().length;
      return `<section class="p-card" aria-labelledby="t-pedir">
          <div class="p-card-cab"><h2 id="t-pedir">${ic('tool')} Pedir um serviço</h2>${meus ? `<a class="p-link" href="#/pedidos">Meus pedidos (${meus}) ${ic('arrow-right')}</a>` : ''}</div>
          <p>Marque o lugar no mapa, mande uma foto se puder e receba um protocolo para acompanhar.</p>
          <ul class="p-servicos">${GC.TIPOS_PEDIDO.map((t) => `<li><a class="p-servico" href="#/pedir/${t.id}">${ic(t.icone)}<span>${esc(t.nome)}</span><small>Pedir pelo portal</small></a></li>`).join('')}</ul>
          <p class="pp-ligar">Prefere ligar? <a href="tel:${esc(tel.replace(/[^\d+]/g, ''))}"><b>${esc(tel)}</b></a>. Diga o endereço e um ponto de referência.</p>
          ${meus ? '' : `<a class="p-link" href="#/pedidos">${ic('search')} Acompanhar um pedido pelo protocolo</a>`}
        </section>`;
    }

    // Início: os pedidos deste aparelho, quando houver, cada um com o protocolo e o andamento (revisão de 19/11).
    function htmlInicio() {
      const meus = pd.meus();
      if (!meus.length) return '';
      return `<section class="p-card" aria-labelledby="t-meus-ini">
          <div class="p-card-cab"><h2 id="t-meus-ini">${ic('clipboard-list')} Seus pedidos</h2><a class="p-link" href="#/pedidos">Ver todos ${ic('arrow-right')}</a></div>
          <ul class="pp-lista pp-lista-passos">${meus.slice(0, 3).map((m) => htmlItemMeu(m).replace(/<\/a><\/li>$/, `</a>${htmlPassos(m.ponto)}</li>`)).join('')}</ul>
        </section>`;
    }

    // Mapa do portal: pontos com pedido aberto (tipo, contador e situação; sem foto nem descrição).
    function pontosMapa() {
      return pd.pontos().filter((p) => !p.juntadoA && p.situacao !== 'resolvido' && Number.isFinite(p.lat)).map((p) => ({
        id: `pedidos-${p.id}`, camada: 'pedidos', icone: tipoIcone(p.tipo), titulo: tipoNome(p.tipo),
        texto: `${relatosTxt(p.relatos)}. ${GC.SITUACOES_PEDIDO[p.situacao]}: ${p.detalhe || ''}.`, lat: p.lat, lng: p.lng,
      }));
    }

    // ---------- formulário ----------
    function novoForm(tipo) {
      const b = bairroDe(ctx.bairroAtual() || GC.data.bairros[0].id);
      return { tipo, passo: 'onde', lat: b.centro[0], lng: b.centro[1], bairroId: b.id, perto: null, descricao: '', foto: null, erro: '', enviado: null, reforco: false };
    }
    function htmlEscolherTipo() {
      return `<div class="p-cab"><h1 id="t-pedidos" tabindex="-1">O que você quer pedir?</h1><p>Escolha o tipo de problema. Em seguida você marca o lugar no mapa.</p></div>
        <section class="p-card"><ul class="p-servicos">${GC.TIPOS_PEDIDO.map((t) => `<li><a class="p-servico" href="#/pedir/${t.id}">${ic(t.icone)}<span>${esc(t.nome)}</span></a></li>`).join('')}</ul></section>
        <p><a class="p-link" href="#/servicos">${ic('arrow-left')} Voltar para o portal</a></p>`;
    }
    const cabForm = (titulo, sub) => `<div class="p-cab"><p class="pp-tipo">${ic(tipoIcone(form.tipo))} ${esc(tipoNome(form.tipo))}</p><h1 id="t-pedidos" tabindex="-1">${esc(titulo)}</h1>${sub ? `<p>${esc(sub)}</p>` : ''}</div>`;
    function htmlOnde() {
      return `${cabForm('Onde é o problema?', 'Arraste o alfinete ou toque no mapa no lugar exato.')}
        <section class="p-card">
          <div class="pp-mapa-caixa"><div id="pp-mapa" class="pp-mapa" role="region" aria-label="Mapa para marcar o lugar do problema"></div></div>
          <p class="pp-onde" id="pp-onde">${ic('map-pin')} ${esc(bairroDe(form.bairroId).nome)}</p>
          <div class="pp-acoes-linha">
            <button type="button" class="p-btn p-btn-sec" data-pp="geo">${ic('current-location')} Usar minha localização</button>
            <label class="p-campo pp-sel-bairro">Ou escolha o bairro <select data-pp="bairro">${GC.data.bairros.slice().sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')).map((b) => `<option value="${b.id}"${b.id === form.bairroId ? ' selected' : ''}>${esc(b.nome)}</option>`).join('')}</select></label>
          </div>
          <p class="pp-erro" role="alert">${esc(form.erro)}</p>
          <div class="pp-pe"><a class="p-btn p-btn-sec" href="#/pedir">${ic('arrow-left')} Voltar</a><button type="button" class="p-btn" data-pp="continuar">Continuar ${ic('arrow-right')}</button></div>
        </section>`;
    }
    function htmlExiste() {
      const x = form.perto;
      const p = x.ponto;
      const o = x.ocorrencia;
      const situacao = p ? `${GC.SITUACOES_PEDIDO[p.situacao]} · ${p.detalhe || ''}` : (GC.situacaoDoPedido(o) || {}).detalhe || 'Em atendimento';
      const n = p ? p.relatos : 0;
      return `${cabForm('Já tem pedido aqui', `A ${x.distanciaM} m do ponto que você marcou.`)}
        <section class="p-card pp-existe">
          <p class="pp-existe-n">${ic('users')} ${n ? `<b>${esc(relatosTxt(n))}</b> este problema.` : '<b>A Prefeitura já está cuidando</b> deste problema.'}</p>
          <p>${esc(situacao)}</p>
          <p class="p-dica">Se for o mesmo problema, confirme: o seu relato soma aos outros, ajuda a Prefeitura a ver a urgência e você recebe um protocolo para acompanhar.</p>
          <div class="pp-pe"><button type="button" class="p-btn p-btn-sec" data-pp="outro">É outro problema</button><button type="button" class="p-btn" data-pp="tambem">${ic('thumb-up')} Também vi isso</button></div>
        </section>`;
    }
    function htmlDetalhes() {
      return `${cabForm(form.reforco ? 'Quer acrescentar algo?' : 'Conte um pouco mais', 'Foto e descrição ajudam a equipe a chegar preparada. As duas são opcionais.')}
        <section class="p-card">
          <label class="p-campo">Descrição <textarea data-pp="descricao" rows="3" maxlength="${GC.MAX_DESCRICAO_PEDIDO}" placeholder="Ex.: em frente ao número 120, perto da padaria">${esc(form.descricao)}</textarea></label>
          <label class="p-campo">Foto <input type="file" data-pp="foto" accept="image/*" capture="environment"></label>
          ${form.foto ? `<div class="pp-previa"><img src="${esc(form.foto)}" alt="Prévia da foto do problema"><button type="button" class="p-link" data-pp="tirar-foto">${ic('trash')} Tirar a foto</button></div>` : ''}
          <p class="pp-aviso">${ic('lock')} Não fotografe pessoas nem placas de carro. O portal não pede seu nome, telefone ou e-mail: você acompanha pelo protocolo.</p>
          <p class="pp-erro" role="alert">${esc(form.erro)}</p>
          <div class="pp-pe"><button type="button" class="p-btn p-btn-sec" data-pp="voltar-onde">${ic('arrow-left')} Voltar</button><button type="button" class="p-btn" data-pp="enviar">${ic('send')} Enviar pedido</button></div>
        </section>`;
    }
    function htmlEnviado() {
      const r = form.enviado;
      return `<div class="p-cab"><h1 id="t-pedidos" tabindex="-1">${ic('circle-check')} Pedido enviado</h1><p>${r.reforco ? 'Seu relato foi somado aos outros deste problema.' : 'A Prefeitura recebeu o seu pedido.'}</p></div>
        <section class="p-card pp-enviado">
          <p>Seu protocolo</p>
          <p class="pp-protocolo" id="pp-protocolo">${esc(r.protocolo)}</p>
          <p class="p-dica">Fica salvo em "Meus pedidos" neste aparelho. Anote se quiser acompanhar de outro lugar.</p>
          <div class="pp-pe"><button type="button" class="p-btn p-btn-sec" data-pp="copiar">${ic('copy')} Copiar protocolo</button><a class="p-btn" href="#/pedidos/${esc(r.protocolo)}">Acompanhar ${ic('arrow-right')}</a></div>
        </section>`;
    }

    function montarMiniMapa() {
      if (mini) { try { mini.remover(); } catch (e) { /* já saiu */ } mini = null; }
      const caixa = $('pp-mapa');
      if (!caixa || !GC.criarMapaCidadao) return;
      mini = GC.criarMapaCidadao(caixa, { aoClicar: (p) => moverPara(p.lat, p.lng, false), areasRisco: [] }) || null;
      if (!mini) return;
      mini.alfinete(form.lat, form.lng, (p) => moverPara(p.lat, p.lng, false));
      setTimeout(() => { mini.redimensionar(); mini.centrar(form.lat, form.lng, 15); }, 60);
    }
    function moverPara(lat, lng, voar) {
      const b = GC.bairroDoPonto(lat, lng);
      if (!b) { form.erro = 'Esse ponto fica fora da cidade. Marque um lugar dentro de um bairro.'; mostrarErro(); if (mini) mini.alfinete(form.lat, form.lng, (p) => moverPara(p.lat, p.lng, false)); return; }
      Object.assign(form, { lat, lng, bairroId: b, erro: '' });
      if (mini) { mini.alfinete(lat, lng, (p) => moverPara(p.lat, p.lng, false)); if (voar) mini.centrar(lat, lng, 16); }
      const onde = $('pp-onde');
      if (onde) onde.innerHTML = `${ic('map-pin')} ${esc(bairroDe(b).nome)}`;
      const sel = el().querySelector('[data-pp="bairro"]');
      if (sel) sel.value = b;
      mostrarErro();
    }
    function mostrarErro() { const e = el().querySelector('.pp-erro'); if (e) e.textContent = form.erro || ''; }

    const reduzirFoto = GC.reduzirFotoPedido;

    const MOTIVOS = { foto: 'Esse arquivo não é uma imagem.', foto_grande: 'A foto ficou grande demais. Tente outra.', fora: 'Esse ponto fica fora da cidade.', local: 'Marque o lugar no mapa.', estado: 'Esse pedido já foi resolvido. Abra um novo, se o problema voltou.', tipo: 'Escolha o tipo de problema.' };
    function enviar() {
      const dados = { tipo: form.tipo, lat: form.lat, lng: form.lng, bairroId: form.bairroId, descricao: form.descricao, foto: form.foto };
      const x = form.perto;
      let r;
      if (form.reforco && x && x.ponto) r = pd.reforcar(x.ponto.id, dados);
      else if (form.reforco && x && x.ocorrencia) r = pd.abrir(Object.assign(dados, { ocorrencia: x.ocorrencia }));
      else r = pd.abrir(dados);
      if (!r.ok) { form.erro = MOTIVOS[r.motivo] || 'Não deu para enviar. Tente de novo.'; mostrarErro(); return; }
      form.enviado = { protocolo: r.pedido.protocolo, reforco: form.reforco };
      form.passo = 'enviado';
      desenhar(true);
      ctx.aoMudar();
    }

    // ---------- meus pedidos e um pedido ----------
    function htmlLista() {
      const meus = pd.meus();
      const achado = buscaProto ? pd.doProtocolo(buscaProto) : null;
      return `<div class="p-cab p-cab-linha"><div><h1 id="t-pedidos" tabindex="-1">Meus pedidos</h1><p>Os pedidos feitos neste aparelho e a situação de cada um.</p></div>
          <a class="p-btn" href="#/pedir">${ic('plus')} Novo pedido</a></div>
        <section class="p-card">
          ${meus.length ? `<ul class="pp-lista">${meus.map(htmlItemMeu).join('')}</ul>` : `<p class="p-vazio">${ic('clipboard-list')} Nenhum pedido feito neste aparelho ainda.</p>`}
        </section>
        <section class="p-card" aria-labelledby="t-buscar-proto">
          <h2 id="t-buscar-proto">${ic('search')} Acompanhar pelo protocolo</h2>
          <form class="pp-busca" data-pp="buscar"><label class="p-busca"><span class="p-so-leitor">Número do protocolo</span><input type="search" name="protocolo" placeholder="Ex.: ${esc(String(new Date(GC.agora()).getFullYear()))}-004812" value="${esc(buscaProto)}" inputmode="numeric" autocomplete="off"></label><button type="submit" class="p-btn p-btn-sec">Buscar</button></form>
          ${buscaProto ? (achado ? `<p><a class="p-link" href="#/pedidos/${esc(achado.protocolo)}">${esc(tipoNome(achado.ponto.tipo))} · ${esc(bairroDe(achado.ponto.bairroId).nome)}: ${esc(GC.SITUACOES_PEDIDO[achado.ponto.situacao])} ${ic('arrow-right')}</a></p>` : `<p class="pp-erro" role="alert">Nenhum pedido com o protocolo ${esc(buscaProto)}.</p>`) : ''}
        </section>`;
    }
    function htmlAvaliar(m) {
      return `<section class="p-card pp-avaliacao" aria-labelledby="t-avaliar">
          <h2 id="t-avaliar">${ic('star')} Como foi o atendimento?</h2>
          <form data-pp="avaliar">
            <fieldset class="pp-sim-nao"><legend>O problema foi resolvido?</legend>
              <label><input type="radio" name="resolvido" value="sim" required> Sim</label><label><input type="radio" name="resolvido" value="nao"> Não</label></fieldset>
            <fieldset class="pp-estrelas"><legend>Sua nota</legend>
              ${[5, 4, 3, 2, 1].map((n) => `<label><input type="radio" name="nota" value="${n}" required><span aria-hidden="true">${ic('star-filled')}</span><span class="p-so-leitor">${n} de 5</span></label>`).join('')}</fieldset>
            <label class="p-campo">Comentário (opcional) <textarea name="comentario" rows="2" maxlength="${GC.MAX_DESCRICAO_PEDIDO}"></textarea></label>
            <p class="pp-erro" role="alert"></p>
            <button type="submit" class="p-btn">Enviar avaliação</button>
          </form>
        </section>`;
    }
    function htmlUm(protocolo) {
      const m = pd.doProtocolo(protocolo);
      if (!m) return `<div class="p-cab"><h1 id="t-pedidos" tabindex="-1">Pedido não encontrado</h1><p>Confira o número do protocolo.</p></div><p><a class="p-link" href="#/pedidos">${ic('arrow-left')} Meus pedidos</a></p>`;
      const p = m.ponto;
      const meu = m.meu;
      const ev = p.evidencia;
      const linha = p.linha.slice().reverse();
      return `<div class="p-cab"><p class="pp-tipo">${ic(tipoIcone(p.tipo))} ${esc(tipoNome(p.tipo))} · ${esc(bairroDe(p.bairroId).nome)}</p><h1 id="t-pedidos" tabindex="-1">Protocolo ${esc(m.protocolo)}</h1><p>Aberto em ${esc(quando(m.criadoEm))}</p></div>
        <section class="p-card">
          ${htmlPassos(p)}
          <p class="pp-agora"><b>${esc(GC.SITUACOES_PEDIDO[p.situacao])}:</b> ${esc(p.detalhe || '')}</p>
          <p class="pp-relatos">${ic('users')} ${esc(relatosTxt(p.relatos))} este problema.</p>
        </section>
        ${ev ? `<section class="p-card pp-feito"><h2>${ic('circle-check')} O que foi feito</h2><p>${esc(ev.texto)}</p>${ev.foto ? `<img class="pp-foto" src="${esc(ev.foto)}" alt="Foto do serviço feito">` : ''}<small>${esc(quando(ev.t))}</small></section>` : ''}
        ${meu && p.situacao === 'resolvido' && !m.avaliacao ? htmlAvaliar(m) : ''}
        ${m.avaliacao && meu ? `<section class="p-card"><h2>${ic('star')} Sua avaliação</h2><p><span class="pp-nota" role="img" aria-label="Nota ${m.avaliacao.nota} de 5">${[1, 2, 3, 4, 5].map((n) => ic(n <= m.avaliacao.nota ? 'star-filled' : 'star')).join('')}</span> · ${m.avaliacao.resolvido ? 'Resolvido' : 'Não resolvido'}</p>${m.avaliacao.comentario ? `<p>“${esc(m.avaliacao.comentario)}”</p>` : ''}<p class="p-dica">Obrigado. A sua nota entra no índice de satisfação da Prefeitura.</p></section>` : ''}
        ${meu && (m.descricao || m.foto) ? `<section class="p-card"><h2>${ic('message')} O que você mandou</h2>${m.descricao ? `<p>${esc(m.descricao)}</p>` : ''}${m.foto ? `<img class="pp-foto" src="${esc(m.foto)}" alt="Sua foto do problema">` : ''}</section>` : ''}
        <section class="p-card"><h2>${ic('timeline')} Linha do tempo</h2><ul class="pp-tempo">${linha.map((x) => `<li><small>${esc(quando(x.t))}</small>${esc(x.texto)}</li>`).join('')}</ul></section>
        <p><a class="p-link" href="#/pedidos">${ic('arrow-left')} Meus pedidos</a></p>`;
    }

    // ---------- desenho e eventos ----------
    function htmlAtual() {
      if (rota[0] === 'pedir') {
        if (!rota[1] || !GC.tipoPedido(rota[1])) return htmlEscolherTipo();
        if (!form || form.tipo !== rota[1]) form = novoForm(rota[1]);
        return { onde: htmlOnde, existe: htmlExiste, detalhes: htmlDetalhes, enviado: htmlEnviado }[form.passo]();
      }
      if (rota[1]) return htmlUm(decodeURIComponent(rota[1]));
      return htmlLista();
    }
    function desenhar(focar) {
      const raiz = el();
      raiz.innerHTML = htmlAtual();
      ligar(raiz);
      if (rota[0] === 'pedir' && form && form.passo === 'onde' && rota[1]) montarMiniMapa();
      if (focar) { const t = $('t-pedidos'); if (t) t.focus({ preventScroll: true }); window.scrollTo(0, 0); }
    }
    function ligar(raiz) {
      const q = (k) => raiz.querySelector(`[data-pp="${k}"]`);
      const on = (k, fn) => { const b = q(k); if (b) b.onclick = fn; };
      on('geo', () => {
        if (!navigator.geolocation) { form.erro = 'Este navegador não informa a localização.'; mostrarErro(); return; }
        navigator.geolocation.getCurrentPosition((pos) => moverPara(pos.coords.latitude, pos.coords.longitude, true),
          () => { form.erro = 'Não foi possível usar a localização. Marque no mapa.'; mostrarErro(); }, { timeout: 10000, maximumAge: 300000 });
      });
      const sel = q('bairro');
      if (sel) sel.onchange = () => { const b = bairroDe(sel.value); moverPara(b.centro[0], b.centro[1], true); };
      on('continuar', () => {
        if (!GC.bairroDoPonto(form.lat, form.lng)) { form.erro = 'Marque um lugar dentro da cidade.'; mostrarErro(); return; }
        form.perto = pd.perto(form.tipo, form.lat, form.lng, store.ocorrencias());
        form.passo = form.perto ? 'existe' : 'detalhes';
        form.reforco = false;
        desenhar(true);
      });
      on('outro', () => { form.passo = 'detalhes'; form.reforco = false; form.perto = null; desenhar(true); });
      on('tambem', () => { form.passo = 'detalhes'; form.reforco = true; desenhar(true); });
      on('voltar-onde', () => { form.passo = 'onde'; form.erro = ''; desenhar(true); });
      const d = q('descricao');
      if (d) d.oninput = () => { form.descricao = d.value; };
      const f = q('foto');
      if (f) f.onchange = async () => {
        const arq = f.files && f.files[0];
        if (!arq) return;
        try { form.foto = await reduzirFoto(arq); form.erro = ''; } catch (e) { form.erro = 'Não deu para ler essa foto. Tente outra.'; }
        desenhar(false);
      };
      on('tirar-foto', () => { form.foto = null; desenhar(false); });
      on('enviar', enviar);
      on('copiar', async () => {
        try { await navigator.clipboard.writeText(form.enviado.protocolo); toast('Protocolo copiado.'); }
        catch (e) { const s = window.getSelection(); const r = document.createRange(); r.selectNodeContents($('pp-protocolo')); s.removeAllRanges(); s.addRange(r); toast('Protocolo selecionado: copie com o menu do aparelho.'); }
      });
      const busca = q('buscar');
      if (busca) busca.onsubmit = (e) => { e.preventDefault(); buscaProto = String(busca.protocolo.value || '').trim(); desenhar(false); };
      const av = q('avaliar');
      if (av) av.onsubmit = (e) => {
        e.preventDefault();
        const fd = new FormData(av);
        const r = pd.avaliar(decodeURIComponent(rota[1]), { resolvido: fd.get('resolvido') === 'sim', nota: Number(fd.get('nota')), comentario: fd.get('comentario') });
        if (!r.ok) { av.querySelector('.pp-erro').textContent = 'Escolha se foi resolvido e uma nota de 1 a 5.'; return; }
        toast('Avaliação enviada. Obrigado!');
        desenhar(false);
        ctx.aoMudar();
      };
    }

    // ---------- Prefeitura simulada (sem painel aberto) ----------
    function simular() {
      if (painelAberto()) return;
      const t = GC.agora();
      pd.paraSimular().forEach((p) => {
        const passo = PASSOS_SIMULADOS.find((x) => x.de === p.situacao && (!x.so || x.so(p)));
        if (!passo || t - p.situacaoEm < passo.apos * 1000) return;
        const extra = { detalhe: passo.detalhe(sec(p.area)) };
        if (passo.para === 'resolvido') extra.evidencia = { texto: EVIDENCIA_SIMULADA[p.tipo] || 'A equipe concluiu o serviço no local.', foto: null };
        pd.atualizar(p.id, passo.para, extra);
      });
    }
    setInterval(simular, 2000);
    // Mudou no registro (aqui ou em outra aba): redesenha a lista e o pedido aberto (nunca o formulário em curso).
    pd.assinar(() => { if (rota.length && (rota[0] === 'pedidos')) desenhar(false); });

    return {
      htmlServicos,
      htmlInicio,
      pontosMapa,
      // partes: a rota já separada (['pedir', 'buraco'], ['pedidos', '2026-004812']).
      mostrar(partes, { focar = false } = {}) {
        rota = partes;
        if (rota[0] !== 'pedir' && mini) { try { mini.remover(); } catch (e) { /* já saiu */ } mini = null; }
        // Voltar ao formulário pela rota depois de enviar começa um pedido novo.
        if (form && form.passo === 'enviado') form = null;
        desenhar(focar);
      },
      titulo: () => (rota[0] === 'pedir' ? 'Pedir um serviço' : 'Meus pedidos'),
    };
  };
})(window.GC = window.GC || {});
