(function (GC) {
  // Página de entrada (entrar.html): entrar, recuperar a senha em 3 passos e "entrar como…" da demonstração.
  // As regras (validade, bloqueio, código) moram em js/sessao.js; cada tentativa vai para a auditoria.
  const esc = (t) => GC.escaparHtml(t);
  const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
  const relogio = (seg) => `${Math.floor(seg / 60)}:${String(seg % 60).padStart(2, '0')}`;
  const ESPERA_REENVIO_S = 30;

  document.addEventListener('DOMContentLoaded', () => {
    const $ = (id) => document.getElementById(id);
    const q = new URLSearchParams(window.location.search);
    const sessao = GC.sessao;
    const auditar = (acao, dados) => GC.auditoria.registrar(acao, dados);
    const cidade = GC.cidade ? GC.cidade.nome : 'Vila Dourada';
    const reduzir = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // ---- marca da prefeitura (Personalizar → padrão de todos): cores no <head>; aqui o nome e o logo ----
    const pers = GC.personalizacao ? GC.personalizacao.aplicarEntrada() : null;
    const marcaPref = pers ? pers.marca : { nome: 'Golden Atlas', nomeCabecalho: '', logo: null };
    const nomeCidade = marcaPref.nomeCabecalho || cidade;
    $('en-cidade').textContent = nomeCidade;
    // "Prefeitura de" sobra quando o nome do cabeçalho já diz de quem é.
    if (/prefeitura|munic[ií]pio/i.test(nomeCidade)) document.querySelector('.en-marca h1 small').hidden = true;
    document.querySelector('.en-marca h1').classList.toggle('en-nome-longo', nomeCidade.length > 22);
    // Slogan da gestão (Personalização), logo abaixo do nome.
    if (marcaPref.slogan) {
      const s = document.createElement('p');
      s.className = 'en-slogan';
      s.textContent = marcaPref.slogan;
      document.querySelector('.en-marca h1').insertAdjacentElement('afterend', s);
    }
    if (marcaPref.logo) {
      // O logo próprio vai para o topo; o Golden Atlas desce para a assinatura.
      const brasao = $('en-brasao');
      brasao.querySelector('img').src = marcaPref.logo;
      brasao.querySelector('img').alt = marcaPref.nome !== 'Golden Atlas' ? marcaPref.nome : `Prefeitura de ${cidade}`;
      brasao.hidden = false;
      document.querySelector('.en-logo').hidden = true;
      $('en-assinatura').hidden = false;
    }
    document.title = `Entrar · ${nomeCidade} · ${marcaPref.nome}`;
    const exemploEmail = `nome@${GC.DOMINIO_DEMO || 'prefeitura.demo'}`;
    ['en-email', 'en-rec-email'].forEach((id) => { $(id).placeholder = exemploEmail; });

    // Fundo do lado da marca: o campo de símbolos com um aceso (manual, cap. 05), como na abertura do painel.
    // Duas zonas limpas: o logo em cima e o texto embaixo; o resto do lado fica preenchido.
    // O símbolo aceso muda de lugar com a cidade (cada prefeitura tem o seu campo).
    const marca = document.querySelector('.en-marca');
    // Fundo próprio (Personalização → Entrada do painel): cor lisa ou imagem com véu, no lugar do grafismo.
    const comGrafismo = !GC.personalizacao || !marca || GC.personalizacao.aplicarFundo(marca);
    const transicao = GC.personalizacao ? GC.personalizacao.entrada().entrada.transicao : 'abrir';
    if (GC.grafismo && marca && comGrafismo) {
      // Pelo nome (o que a pessoa vê); fica sempre na faixa livre entre o logo e o texto.
      const s = GC.grafismo.semente(cidade);
      const alvo = [900 * (0.5 + (s % 7) / 20), 1200 * (0.22 + (Math.floor(s / 7) % 6) * 0.05)];
      const campo = GC.grafismo.campoAlerta({ w: 900, h: 1200, k: 1, cor: '#ffffff', op: 0.12, zonas: [{ x: 40, y: 40, w: 420, h: 110 }, { x: 40, y: 760, w: 760, h: 380 }], alvo, logo: marcaPref.logo });
      marca.insertAdjacentHTML('afterbegin', GC.grafismo.fundo(campo, 900, 1200, 'ga-grafismo en-campo'));
      if (!reduzir) animarCampo(marca.querySelector('.en-campo'));
    }

    // Entrada da página: os símbolos surgem das bordas para dentro, em direção ao aceso, que chega por último
    // como um aviso (movimento.md, item 2). Só opacidade e escala, uma vez; o laranja não pulsa depois.
    function animarCampo(svg) {
      const aceso = svg.querySelector('.ga-aceso');
      const pos = (g) => (g.getAttribute('transform').match(/translate\(([-\d.]+)[ ,]+([-\d.]+)\)/) || [0, 0, 0]).slice(1).map(Number);
      const [ax, ay] = aceso ? pos(aceso) : [450, 600];
      const simbolos = [...svg.children].filter((g) => g.tagName.toLowerCase() === 'g' && g !== aceso);
      const dist = simbolos.map((g) => { const [x, y] = pos(g); return Math.hypot(x - ax, y - ay); });
      const maior = Math.max(1, ...dist);
      simbolos.forEach((g, i) => { g.style.animationDelay = `${Math.round((1 - dist[i] / maior) * 650)}ms`; });
      if (aceso) aceso.innerHTML = `<g class="en-aceso-in">${aceso.innerHTML}</g>`;
      svg.classList.add('en-campo-anima');
    }

    // Links do rodapé levam a cidade escolhida.
    const comCidade = (pagina, extra = {}) => {
      const u = new URL(pagina, window.location.href);
      if (GC.cidade) u.searchParams.set('cidade', GC.cidade.id);
      Object.entries(extra).forEach(([k, v]) => u.searchParams.set(k, v));
      return u.toString();
    };
    $('en-portal').href = comCidade('cidadao.html', { perfil: 'cidadao' });
    $('en-privacidade').href = comCidade('privacidade.html', { login: '1' });

    // ---- aviso do topo (motivo da vinda, sessão ainda aberta ou senha trocada) ----
    const aviso = $('en-aviso');
    function avisar(html, tipo = 'info') {
      aviso.className = `en-aviso en-aviso-${tipo}`;
      // O aviso é flex (ícone ao lado do texto): o texto vai num <span> só, senão cada pedaço vira uma coluna.
      const m = String(html || '').match(/^\s*(<i[^>]*><\/i>)\s*([\s\S]*)$/);
      aviso.innerHTML = m ? `${m[1]}<span>${m[2]}</span>` : html;
      aviso.hidden = !html;
    }
    const motivo = q.get('motivo');
    const jaDentro = sessao.atual();
    if (motivo === 'vencida') avisar('<i class="ti ti-clock" aria-hidden="true"></i> Sua sessão terminou. Entre de novo para continuar de onde parou.', 'alerta');
    else if (motivo === 'saiu') avisar('<i class="ti ti-logout" aria-hidden="true"></i> Você saiu do painel.');
    else if (jaDentro) {
      avisar(`<i class="ti ti-user-check" aria-hidden="true"></i> Você já entrou como <b>${esc(jaDentro.nome)}</b>. <a href="${esc(GC.urlDepoisDeEntrar(jaDentro))}">Continuar no painel</a>`);
    }

    // ---- erros: o geral (acima do botão) e o do campo (embaixo dele, ligado por aria-describedby) ----
    const erro = (form, texto) => {
      const p = form.querySelector('.en-erro');
      p.innerHTML = texto;
      p.hidden = !texto;
    };
    function erroCampo(input, texto) {
      const p = $(`${input.id}-erro`);
      input.setAttribute('aria-invalid', texto ? 'true' : 'false');
      input.closest('.en-campo').classList.toggle('invalido', !!texto);
      if (p) { p.innerHTML = texto ? `<i class="ti ti-alert-circle" aria-hidden="true"></i> ${texto}` : ''; p.hidden = !texto; }
      if (texto) input.focus();
    }
    const limparErros = (form) => {
      erro(form, '');
      form.querySelectorAll('input[aria-invalid]').forEach((i) => erroCampo(i, ''));
    };
    // Corrigiu o campo: o erro dele some na hora.
    document.querySelectorAll('.en-campo input').forEach((i) => i.addEventListener('input', () => {
      if (i.getAttribute('aria-invalid') === 'true') erroCampo(i, '');
    }));

    // ---- passos ----
    const passos = [...document.querySelectorAll('.en-passo')];
    const caixa = $('en-caixa');
    let passoAtual = '';
    const cartao = document.querySelector('.en-cartao');
    // A ordem diz o sentido: avançar entra pela direita, voltar entra pela esquerda.
    const ORDEM_PASSOS = ['inicio', 'entrar', 'govbr', 'primeiro', 'email', 'codigo', 'senha'];
    let fimTroca = null;
    function trocarPasso(de, para) {
      if (fimTroca) fimTroca();
      const h0 = cartao.offsetHeight;
      passos.forEach((p) => { p.hidden = p !== para; });
      if (reduzir || !de || de === para) return;
      const frente = ORDEM_PASSOS.indexOf(para.dataset.passo) > ORDEM_PASSOS.indexOf(de.dataset.passo);
      // O passo que sai fica por cima, no mesmo lugar, enquanto some; o que entra desliza do lado certo.
      const fantasma = de.cloneNode(true);
      fantasma.removeAttribute('id');
      fantasma.hidden = false;
      fantasma.setAttribute('aria-hidden', 'true');
      fantasma.inert = true;
      // cloneNode não leva o que foi digitado: copia, para o passo que sai não aparecer vazio.
      const campos = de.querySelectorAll('input');
      fantasma.querySelectorAll('input').forEach((i, n) => { i.value = campos[n].value; i.checked = campos[n].checked; });
      fantasma.querySelectorAll('[id]').forEach((el) => el.removeAttribute('id'));
      fantasma.classList.add('en-fantasma', frente ? 'sai-frente' : 'sai-tras');
      fantasma.style.top = `${para.offsetTop}px`;
      cartao.appendChild(fantasma);
      para.classList.add(frente ? 'entra-frente' : 'entra-tras');
      // A altura do cartão acompanha a troca (uma vez, sem salto).
      const h1 = cartao.offsetHeight;
      cartao.style.height = `${h0}px`;
      cartao.getBoundingClientRect();
      cartao.classList.add('en-trocando');
      cartao.style.height = `${h1}px`;
      const t = setTimeout(() => fimTroca && fimTroca(), 420);
      fimTroca = () => {
        clearTimeout(t);
        fantasma.remove();
        para.classList.remove('entra-frente', 'entra-tras');
        cartao.classList.remove('en-trocando');
        cartao.style.height = '';
        fimTroca = null;
      };
    }
    function ir(passo, { focar } = {}) {
      const de = passos.find((p) => p.dataset.passo === passoAtual);
      passoAtual = passo;
      const alvo = passos.find((p) => p.dataset.passo === passo);
      trocarPasso(de, alvo);
      if (de && de !== alvo) $('en-anuncio').textContent = alvo.querySelector('h2').textContent;
      limparErros(alvo);
      // O primeiro campo que está à vista (com "Continuar como", o e-mail fica escondido e o foco vai para a senha).
      const foco = focar ? $(focar) : [...alvo.querySelectorAll('input:not([type=checkbox]), .en-govbr-item, .en-botao-govbr')].find((el) => el.offsetParent !== null) || alvo.querySelector('h2');
      if (foco) foco.focus();
      // A caixa simulada só faz sentido enquanto o código ainda vai ser digitado.
      if (passo !== 'codigo') caixa.hidden = true;
      if (passo !== 'codigo') pararRelogios();
    }
    document.querySelectorAll('[data-ir]').forEach((b) => b.addEventListener('click', () => {
      if (b.dataset.ir === 'email' && passoAtual === 'entrar') $('en-rec-email').value = $('en-email').value.trim();
      ir(b.dataset.ir);
    }));

    // Mostrar/ocultar senha.
    document.querySelectorAll('.en-ver').forEach((b) => b.addEventListener('click', () => {
      const campo = $(b.getAttribute('aria-controls'));
      const ver = campo.type === 'password';
      campo.type = ver ? 'text' : 'password';
      b.setAttribute('aria-pressed', String(ver));
      b.title = ver ? 'Ocultar senha' : 'Mostrar senha';
      b.setAttribute('aria-label', b.title);
      b.innerHTML = `<i class="ti ti-${ver ? 'eye-off' : 'eye'}" aria-hidden="true"></i>`;
    }));

    // Caps Lock ligado no campo de senha (evita errar e bloquear o acesso sem perceber).
    const caps = $('en-senha-caps');
    const olharCaps = (ev) => { if (ev.getModifierState) caps.hidden = !ev.getModifierState('CapsLock'); };
    $('en-senha').addEventListener('keydown', olharCaps);
    $('en-senha').addEventListener('keyup', olharCaps);
    $('en-senha').addEventListener('blur', () => { caps.hidden = true; });

    const emailValido = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
    const textoEmailInvalido = (e) => (e ? `Confira o e-mail. Ele deve ser como ${exemploEmail}.` : 'Digite o seu e-mail.');
    const ocupado = (form, sim) => { const b = form.querySelector('[type=submit]'); b.disabled = sim; b.classList.toggle('carregando', sim); };
    // Uma pausa curta: a resposta não sai instantânea (como num servidor) e o botão mostra que algo aconteceu.
    const aguardar = (f) => setTimeout(f, 450);

    function concluirEntrada(u) {
      auditar('entrar', { usuario: u });
      passarAoPainel(GC.urlDepoisDeEntrar(u));
    }

    // Do login ao painel sem corte: o lado da marca se abre até cobrir a tela e vira a tela de abertura do painel
    // (mesmo fundo, mesmo campo, mesmo logo e mesmo texto do #carregando do index.html), que continua de lá.
    function passarAoPainel(url) {
      const ir = () => window.location.assign(url);
      // Transição escolhida na Personalização: abrir (o lado da marca cobre a tela), esmaecer ou direta.
      if (reduzir || !marca || !GC.grafismo || transicao === 'direta') { ir(); return; }
      const r = marca.getBoundingClientRect();
      const lado = window.innerWidth <= 820 ? 'cima' : 'esq';
      const desloc = lado === 'esq' ? `translateX(${Math.round(r.right - window.innerWidth)}px)` : `translateY(${Math.round(r.bottom - window.innerHeight)}px)`;
      const campo = GC.grafismo.campoAlerta({ w: 1600, h: 900, k: 1.1, cor: '#ffffff', op: 0.13, zonas: [{ x: 520, y: 230, w: 560, h: 440 }], alvo: [1600 * 5 / 6, 900 / 4], logo: marcaPref.logo });
      const logo = marcaPref.logo || 'identidade-visual/logo/svg/vertical-escuro.svg';
      const capa = document.createElement('div');
      capa.className = `en-saida${transicao === 'esmaecer' ? ' en-saida-esmaece' : ''}`;
      capa.setAttribute('role', 'status');
      if (transicao !== 'esmaecer') capa.style.transform = desloc;
      const grafismoNaCapa = GC.personalizacao ? GC.personalizacao.aplicarFundo(capa) : true;
      capa.innerHTML = `${grafismoNaCapa ? GC.grafismo.fundo(campo, 1600, 900, 'ga-grafismo en-saida-campo') : ''}
        <div class="en-saida-caixa">
          <img class="en-saida-logo${marcaPref.logo ? ' logo-propria' : ''}" src="${esc(logo)}" alt="" width="136" height="124">
          <b>${esc(cidade)}</b>
          <span>Carregando o mapa e os indicadores da cidade…</span>
          <span class="en-saida-espera" aria-hidden="true"></span>
        </div>`;
      document.body.appendChild(capa);
      document.body.classList.add('en-saindo');
      capa.getBoundingClientRect(); // fixa o ponto de partida antes de animar
      capa.classList.add('aberta');
      capa.style.transform = '';
      let foi = false;
      // O logo já chegou aqui: a abertura do painel não repete a chegada (index.html lê a marca e a apaga).
      try { sessionStorage.setItem('gc.vemDoLogin', '1'); } catch (e) { /* sem armazenamento: o logo chega de novo */ }
      const seguir = () => { if (!foi) { foi = true; setTimeout(ir, 300); } };
      capa.addEventListener('transitionend', (ev) => { if (ev.target === capa) seguir(); });
      setTimeout(seguir, 900); // se o transitionend não vier (aba em segundo plano)
    }

    // ---- 1. entrar ----
    const fEntrar = $('en-entrar');
    let bloqueio = null; // { email, ate, timer }: o botão fica parado até o fim (ou até trocar o e-mail)
    function soltarBloqueio() {
      if (!bloqueio) return;
      clearInterval(bloqueio.timer);
      bloqueio = null;
      fEntrar.querySelector('[type=submit]').disabled = false;
      erro(fEntrar, '');
    }
    function mostrarBloqueio(email, minutos) {
      soltarBloqueio();
      const ate = Date.now() + minutos * 60000;
      const botao = fEntrar.querySelector('[type=submit]');
      const desenhar = () => {
        const resta = Math.ceil((ate - Date.now()) / 1000);
        if (resta <= 0) { soltarBloqueio(); return; }
        erro(fEntrar, `<i class="ti ti-lock" aria-hidden="true"></i> Muitas tentativas seguidas. Tente de novo em <b>${relogio(resta)}</b> ou <button type="button" class="en-link en-link-texto" data-ir-erro="email">recupere a senha</button>.`);
        const link = fEntrar.querySelector('[data-ir-erro]');
        if (link) link.onclick = () => { $('en-rec-email').value = email; ir('email'); };
      };
      bloqueio = { email: email.toLowerCase(), ate, timer: setInterval(desenhar, 1000) };
      botao.disabled = true;
      desenhar();
    }
    $('en-email').addEventListener('input', () => {
      if (bloqueio && $('en-email').value.trim().toLowerCase() !== bloqueio.email) soltarBloqueio();
    });

    fEntrar.addEventListener('submit', (ev) => {
      ev.preventDefault();
      limparErros(fEntrar);
      const email = $('en-email').value.trim();
      const senha = $('en-senha').value;
      if (!emailValido(email)) { erroCampo($('en-email'), textoEmailInvalido(email)); return; }
      if (!senha) { erroCampo($('en-senha'), 'Digite a senha.'); return; }
      ocupado(fEntrar, true);
      aguardar(() => {
        ocupado(fEntrar, false);
        const r = sessao.entrar(email, senha, { manter: $('en-manter').checked });
        if (r.ok && r.primeiroAcesso) { abrirPrimeiro(r.usuario); return; }
        if (r.ok) { concluirEntrada(r.usuario); return; }
        const porque = r.inativo ? 'Usuário desativado' : r.usuario ? 'Senha não confere' : 'E-mail não cadastrado';
        if (r.motivo === 'bloqueado') {
          if (r.acabouDeBloquear) {
            auditar('entrar_falhou', { usuario: r.usuario || null, alvo: email, detalhe: porque });
            auditar('bloqueio', { usuario: r.usuario || null, alvo: email, detalhe: `${GC.SESSAO_REGRAS.bloqueioMin} min` });
          }
          mostrarBloqueio(email, r.restanteMin);
        } else {
          auditar('entrar_falhou', { usuario: r.usuario || null, alvo: email, detalhe: porque });
          const resta = r.tentativasRestantes;
          erro(fEntrar, `E-mail ou senha não conferem.${resta <= 2 ? ` Depois de mais ${plural(resta, 'tentativa', 'tentativas')}, o acesso fica bloqueado por ${GC.SESSAO_REGRAS.bloqueioMin} minutos.` : ''}`);
        }
        $('en-senha').select();
      });
    });

    // ---- 2. pedir código ----
    let emailRec = '';
    function mostrarCaixa(r) {
      const hora = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      caixa.hidden = false;
      caixa.innerHTML = r.codigo
        ? `<p class="en-caixa-rot"><i class="ti ti-inbox" aria-hidden="true"></i> Caixa de entrada de ${esc(emailRec)} <small>(demonstração)</small></p>
          <article class="en-email-msg">
            <header><b>Prefeitura de ${esc(cidade)}</b> <span>nao-responda@${esc(GC.DOMINIO_DEMO)} · ${hora}</span></header>
            <h3>Código para criar uma senha nova</h3>
            <p>Use o código abaixo no painel. Ele vale por ${GC.SESSAO_REGRAS.codigoMin} minutos.</p>
            <p class="en-email-cod">${esc(r.codigo)}</p>
            <p class="en-email-pe">Se não foi você quem pediu, ignore esta mensagem: a sua senha continua a mesma.</p>
          </article>`
        : `<p class="en-caixa-rot"><i class="ti ti-inbox" aria-hidden="true"></i> Caixa de entrada de ${esc(emailRec)} <small>(demonstração)</small></p>
          <p class="en-caixa-vazia">Nenhuma mensagem chegou: este e-mail não está cadastrado ou foi desativado. A tela de recuperação não diz isso de propósito, para ninguém descobrir quem tem acesso.</p>`;
    }

    // Relógios do passo do código: quanto o código ainda vale e quando dá para pedir outro.
    // A validade conta igual para e-mail cadastrado ou não (a tela não pode revelar quem tem acesso).
    let validoAte = 0;
    let reenvioEm = 0;
    let tique = null;
    const reenviar = $('en-reenviar');
    function desenharRelogios() {
      const agora = Date.now();
      const vale = Math.ceil((validoAte - agora) / 1000);
      const linha = $('en-validade');
      linha.classList.toggle('vencido', vale <= 0);
      linha.querySelector('span').textContent = vale > 0 ? `O código vale por mais ${relogio(vale)}` : 'O código venceu. Peça um código novo.';
      const espera = Math.ceil((reenvioEm - agora) / 1000);
      reenviar.disabled = espera > 0;
      reenviar.textContent = espera > 0 ? `Reenviar código em ${relogio(espera)}` : 'Reenviar código';
    }
    function pararRelogios() { clearInterval(tique); tique = null; }
    function iniciarRelogios() {
      validoAte = Date.now() + GC.SESSAO_REGRAS.codigoMin * 60000;
      reenvioEm = Date.now() + ESPERA_REENVIO_S * 1000;
      pararRelogios();
      desenharRelogios();
      tique = setInterval(desenharRelogios, 1000);
    }

    function enviarCodigo() {
      const r = sessao.pedirCodigo(emailRec);
      auditar('codigo', { usuario: r.usuario || null, alvo: emailRec, detalhe: !r.usuario ? 'E-mail não cadastrado' : !r.codigo ? 'Usuário desativado: código não enviado' : '' });
      $('en-cod-email').textContent = emailRec;
      $('en-cod').value = '';
      desenharCasas();
      mostrarCaixa(r);
    }
    const fRec = $('en-recuperar');
    fRec.addEventListener('submit', (ev) => {
      ev.preventDefault();
      limparErros(fRec);
      const email = $('en-rec-email').value.trim();
      if (!emailValido(email)) { erroCampo($('en-rec-email'), textoEmailInvalido(email)); return; }
      ocupado(fRec, true);
      aguardar(() => {
        ocupado(fRec, false);
        emailRec = email.toLowerCase();
        enviarCodigo();
        ir('codigo');
        iniciarRelogios();
      });
    });
    reenviar.addEventListener('click', () => {
      if (reenviar.disabled) return;
      enviarCodigo();
      limparErros(fCod);
      iniciarRelogios();
      avisar('<i class="ti ti-mail-forward" aria-hidden="true"></i> Enviamos um código novo. O anterior deixou de valer.');
      $('en-cod').focus();
    });

    // ---- 3. conferir código ----
    const fCod = $('en-codigo');
    const campoCod = $('en-cod');
    const casas = [...document.querySelectorAll('.en-casas-ver i')];
    function desenharCasas() {
      const v = campoCod.value;
      const focado = document.activeElement === campoCod;
      casas.forEach((c, i) => {
        c.textContent = v[i] || '';
        c.classList.toggle('cheia', !!v[i]);
        c.classList.toggle('atual', focado && i === Math.min(v.length, 5));
      });
    }
    let codigoOk = '';
    campoCod.addEventListener('input', () => {
      campoCod.value = campoCod.value.replace(/\D/g, '').slice(0, 6);
      desenharCasas();
      // Completou os 6 números (digitando ou colando): confere sozinho.
      if (campoCod.value.length === 6 && !fCod.querySelector('[type=submit]').disabled) fCod.requestSubmit();
    });
    ['focus', 'blur', 'keyup', 'click'].forEach((t) => campoCod.addEventListener(t, desenharCasas));
    fCod.addEventListener('submit', (ev) => {
      ev.preventDefault();
      limparErros(fCod);
      const cod = campoCod.value.trim();
      if (!/^\d{6}$/.test(cod)) { erroCampo(campoCod, 'O código tem 6 números.'); return; }
      ocupado(fCod, true);
      aguardar(() => {
        ocupado(fCod, false);
        const r = sessao.conferirCodigo(emailRec, cod);
        if (r.ok) {
          codigoOk = cod;
          avisar('');
          $('en-nova-email').textContent = emailRec;
          $('en-nova-senha').value = '';
          $('en-nova-conf').value = '';
          desenharRegrasNova();
          ir('senha');
          return;
        }
        const textos = {
          expirou: 'O código venceu. Peça um código novo.',
          tentativas: 'Código errado três vezes. Por segurança, ele deixou de valer: peça um código novo.',
          invalido: r.restantes ? `Código não confere. Restam ${plural(r.restantes, 'tentativa', 'tentativas')}.` : 'Código não confere. Peça um código novo.',
        };
        // O código deixou de valer: libera o reenvio na hora.
        if (r.motivo !== 'invalido' || !r.restantes) { reenvioEm = 0; desenharRelogios(); }
        erroCampo(campoCod, textos[r.motivo] || textos.invalido);
        campoCod.select();
        desenharCasas();
      });
    });

    // ---- regras da senha nova (recuperação e primeiro acesso), com "as duas são iguais" ao vivo ----
    function desenharRegras(lista, senha, conf, usuario) {
      const regras = GC.regrasSenha(senha, usuario).concat({ texto: 'As duas senhas são iguais', ok: !!conf && conf === senha });
      lista.innerHTML = regras.map((r) => `<li class="${r.ok ? 'ok' : ''}"><i class="ti ti-${r.ok ? 'circle-check' : 'circle'}" aria-hidden="true"></i> ${esc(r.texto)}<span class="so-leitor">${r.ok ? ': atendida' : ': falta'}</span></li>`).join('');
    }

    // ---- 4. senha nova ----
    const usuarioRec = () => GC.usuarioPorEmail(emailRec);
    const desenharRegrasNova = () => desenharRegras($('en-regras'), $('en-nova-senha').value, $('en-nova-conf').value, usuarioRec());
    $('en-nova-senha').addEventListener('input', desenharRegrasNova);
    $('en-nova-conf').addEventListener('input', desenharRegrasNova);
    const fNova = $('en-nova');
    fNova.addEventListener('submit', (ev) => {
      ev.preventDefault();
      limparErros(fNova);
      const nova = $('en-nova-senha').value;
      if (!GC.senhaValida(nova, usuarioRec())) { erro(fNova, 'A senha ainda não atende a todas as regras.'); $('en-nova-senha').focus(); return; }
      if (nova !== $('en-nova-conf').value) { erro(fNova, 'As duas senhas não são iguais.'); $('en-nova-conf').focus(); return; }
      const r = sessao.redefinirSenha(emailRec, codigoOk, nova);
      if (!r.ok) { erro(fNova, 'O código deixou de valer. Volte e peça um código novo.'); return; }
      auditar('redefinir_senha', { usuario: r.usuario });
      // Volta direto para a entrada, com o e-mail preenchido e o cursor na senha.
      $('en-email').value = emailRec;
      mostrarConta(GC.usuarioPorEmail(emailRec));
      $('en-senha').value = '';
      ir('entrar', { focar: 'en-senha' });
      avisar('<i class="ti ti-circle-check" aria-hidden="true"></i> Senha alterada. Entre com a senha nova.', 'sucesso');
    });

    // ---- primeiro acesso: senha provisória conferida, falta criar a própria ----
    let usuarioPri = null;
    const fPri = $('en-primeiro');
    const regrasPri = () => desenharRegras($('en-pri-regras'), $('en-pri-senha').value, $('en-pri-conf').value, usuarioPri);
    $('en-pri-senha').addEventListener('input', regrasPri);
    $('en-pri-conf').addEventListener('input', regrasPri);
    function abrirPrimeiro(u) {
      usuarioPri = u;
      $('en-pri-nome').textContent = u.nome;
      $('en-pri-senha').value = '';
      $('en-pri-conf').value = '';
      regrasPri();
      avisar('');
      ir('primeiro');
    }
    fPri.addEventListener('submit', (ev) => {
      ev.preventDefault();
      limparErros(fPri);
      const nova = $('en-pri-senha').value;
      if (!GC.senhaValida(nova, usuarioPri)) { erro(fPri, 'A senha ainda não atende a todas as regras.'); $('en-pri-senha').focus(); return; }
      if (nova !== $('en-pri-conf').value) { erro(fPri, 'As duas senhas não são iguais.'); $('en-pri-conf').focus(); return; }
      const r = sessao.definirPrimeiraSenha(nova);
      if (!r.ok) {
        erro(fPri, r.motivo === 'expirou' ? 'O tempo para criar a senha acabou. Entre de novo com a senha provisória.' : 'A senha ainda não atende a todas as regras.');
        if (r.motivo === 'expirou') setTimeout(() => ir('entrar'), 2500);
        return;
      }
      auditar('primeiro_acesso', { usuario: r.usuario });
      concluirEntrada(r.usuario);
    });

    // ---- gov.br (simulado): escolher a conta, "confirmar" e entrar pelo CPF (js/sessao.js, entrarGovbr) ----
    const NOME_NIVEL = { bronze: 'Bronze', prata: 'Prata', ouro: 'Ouro' };
    const fGov = $('en-govbr');
    const listaGov = $('en-govbr-lista');
    const contasGov = GC.data.usuarios
      .filter((u) => u.ativo !== false && (u.perfil === 'prefeito' || GC.nivelDe(u) !== 'unidade'))
      .map((u) => ({ ...GC.contaGovbr(u), cargo: u.cargo, iniciais: u.iniciais }))
      .concat({ ...GC.CONTA_GOVBR_SEM_CADASTRO, cargo: 'Sem cadastro no painel', iniciais: 'MV' });
    listaGov.innerHTML = contasGov.map((c, i) => `
      <button type="button" class="en-govbr-item" data-conta="${i}">
        <span class="en-avatar" aria-hidden="true">${esc(c.iniciais)}</span>
        <span class="en-govbr-quem"><b>${esc(c.nome)}</b><small>CPF ${esc(GC.mascararCpf(c.cpf))} · ${esc(c.cargo)}</small></span>
        <span class="en-nivel en-nivel-${esc(c.nivel)}">${esc(NOME_NIVEL[c.nivel] || c.nivel)}</span>
      </button>`).join('');
    listaGov.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-conta]');
      if (!b || listaGov.classList.contains('ocupada')) return;
      const conta = contasGov[Number(b.dataset.conta)];
      erro(fGov, '');
      listaGov.classList.add('ocupada');
      b.classList.add('carregando');
      b.querySelector('.en-nivel').textContent = 'Confirmando…';
      setTimeout(() => {
        listaGov.classList.remove('ocupada');
        b.classList.remove('carregando');
        b.querySelector('.en-nivel').textContent = NOME_NIVEL[conta.nivel];
        const r = sessao.entrarGovbr(conta, { manter: $('en-manter').checked });
        if (r.ok) { auditar('entrar', { usuario: r.usuario, detalhe: 'gov.br' }); passarAoPainel(GC.urlDepoisDeEntrar(r.usuario)); return; }
        const porque = { sem_cadastro: 'gov.br: CPF sem cadastro', inativo: 'gov.br: usuário desativado', nivel: `gov.br: conta ${r.nivel}` }[r.motivo];
        auditar('entrar_falhou', { usuario: r.usuario || null, alvo: `CPF ${GC.mascararCpf(conta.cpf)}`, detalhe: porque });
        const textos = {
          sem_cadastro: `O gov.br confirmou que você é <b>${esc(conta.nome)}</b>, mas este CPF não tem acesso ao painel. Peça o cadastro ao gestor da sua secretaria.`,
          inativo: 'O seu acesso ao painel está desativado. Fale com o gestor da sua secretaria.',
          nivel: `A sua conta gov.br é nível <b>bronze</b>. Para entrar no painel, ela precisa ser prata ou ouro: suba o nível no aplicativo gov.br (com a validação facial, por exemplo) ou <button type="button" class="en-link en-link-texto" data-ir-erro="entrar">entre com o e-mail</button>.`,
        };
        erro(fGov, `<i class="ti ti-alert-circle" aria-hidden="true"></i> ${textos[r.motivo]}`);
        const link = fGov.querySelector('[data-ir-erro]');
        if (link) link.onclick = () => { if (r.usuario) $('en-email').value = r.usuario.email; ir('entrar', { focar: r.usuario ? 'en-senha' : 'en-email' }); };
        b.focus();
      }, 700);
    });

    // ---- demonstração: entrar como ----
    $('en-senha-demo').textContent = GC.SENHA_DEMO;
    const areas = (GC.data.areas || []);
    const grupo = (titulo, us) => `<p class="en-demo-grupo">${esc(titulo)}</p>${us.map((u) => `
      <button type="button" class="en-demo-item" data-usuario="${esc(u.id)}">
        <span class="en-avatar" aria-hidden="true">${esc(u.iniciais)}</span>
        <span><b>${esc(u.nome)}</b><small>${esc(u.cargo)}${u.provisoria ? ' · primeiro acesso' : ''}</small></span>
        <i class="ti ti-arrow-right en-demo-ir" aria-hidden="true"></i>
      </button>`).join('')}`;
    const us = GC.data.usuarios.filter((u) => u.ativo !== false);
    $('en-demo-lista').innerHTML = grupo('Gabinete (gestor geral)', us.filter((u) => u.perfil === 'prefeito'))
      + grupo('Secretarias (gestor do setor)', us.filter((u) => u.perfil === 'setor').sort((a, b) => areas.findIndex((x) => x.id === a.area) - areas.findIndex((x) => x.id === b.area)))
      + grupo('Servidores (portal do servidor)', us.filter((u) => u.perfil === 'servidor').sort((a, b) => areas.findIndex((x) => x.id === a.area) - areas.findIndex((x) => x.id === b.area)));
    $('en-demo-total').textContent = `(${us.length})`;
    // Um por papel: gestor geral, secretário, diretor de unidade e servidor (o que cada um vê muda bastante).
    const pasta = (u) => { const a = areas.find((x) => x.id === u.area); return a && a.secretaria ? a.secretaria.nome : ''; };
    const papeis = [
      { rotulo: 'Cidade', icone: 'building-community', u: us.find((u) => u.perfil === 'prefeito') },
      { rotulo: 'Secretaria', icone: 'briefcase', u: us.find((u) => u.perfil === 'setor' && u.area === 'saude' && GC.nivelDe(u) !== 'unidade') || us.find((u) => u.perfil === 'setor' && GC.nivelDe(u) !== 'unidade') },
      { rotulo: 'Unidade', icone: 'building-hospital', u: us.find((u) => u.perfil === 'setor' && u.area === 'saude' && GC.nivelDe(u) === 'unidade') || us.find((u) => GC.nivelDe(u) === 'unidade') },
      { rotulo: 'Visão resumida', icone: 'layout-list', u: us.find((u) => u.papel === 'gestor_consulta') },
      { rotulo: 'Servidor', icone: 'user', u: us.find((u) => u.perfil === 'servidor' && u.area === 'defesa_civil') || us.find((u) => u.perfil === 'servidor') },
    ].filter((p) => p.u);
    $('en-demo-papeis').innerHTML = papeis.map((p) => `
      <button type="button" class="en-demo-papel" data-usuario="${esc(p.u.id)}" title="${esc(`${p.u.nome} · ${p.u.cargo}`)}">
        <span class="en-demo-papel-rot"><i class="ti ti-${p.icone}" aria-hidden="true"></i> ${esc(p.rotulo)}</span>
        <b>${esc(p.u.nome)}</b>
        <small>${esc(p.u.perfil === 'prefeito' ? p.u.cargo : p.u.unidade || pasta(p.u) || p.u.cargo)}</small>
      </button>`).join('');
    document.querySelector('.en-demo').addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-usuario]');
      if (!b) return;
      const r = sessao.entrarComo(b.dataset.usuario, { manter: $('en-manter').checked });
      if (r.ok && r.primeiroAcesso) abrirPrimeiro(r.usuario);
      else if (r.ok) concluirEntrada(r.usuario);
    });

    // ---- "Continuar como": a conta de quem entrou por último neste navegador, no lugar do campo de e-mail ----
    function mostrarConta(u) {
      const conta = $('en-conta');
      conta.hidden = !u;
      $('en-email').closest('.en-campo').hidden = !!u;
      if (!u) { conta.innerHTML = ''; return; }
      $('en-email').value = u.email;
      conta.innerHTML = `<span class="en-avatar" aria-hidden="true">${esc(u.iniciais)}</span>
        <span class="en-conta-quem"><b>${esc(u.nome)}</b><small>${esc(u.email)}</small></span>
        <button type="button" class="en-link en-conta-trocar">Usar outra conta</button>`;
      conta.querySelector('.en-conta-trocar').addEventListener('click', () => {
        sessao.esquecerUltimo();
        soltarBloqueio();
        mostrarConta(null);
        $('en-email').value = '';
        $('en-senha').value = '';
        limparErros(fEntrar);
        $('en-email').focus();
      });
    }
    const lembrado = q.get('email') ? null : sessao.ultimo();
    mostrarConta(lembrado);

    // Começa pela escolha (gov.br ou e-mail); com ?email= na URL, direto no formulário.
    ir(q.get('email') ? 'entrar' : 'inicio');
    if (q.get('email')) { $('en-email').value = q.get('email'); $('en-senha').focus(); }
  });
})(window.GC = window.GC || {});
