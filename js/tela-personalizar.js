(function (GC) {
  // Tela "Personalização" (#/personalizar), no menu ⋯: modelos prontos, personalização avançada (cores e fonte),
  // nome e logo, com prévia ao vivo. Nada muda até "Aplicar".
  // No nível "Padrão de todos", o gestor geral escolhe o que está editando: o Painel dos gestores ou o Portal do
  // Cidadão (cidadao.html: cores, atendimento e assinatura; nome e logo vêm do Painel).
  // As regras (níveis, quem pode o quê, cores derivadas) ficam em js/personalizacao.js; a tela só esconde o que não pode.
  const esc = (t) => GC.escaparHtml(t);
  const ORIGEM = { original: 'a marca original (Golden Atlas)', prefeitura: 'o padrão de todos', pasta: 'o padrão da secretaria', pessoal: 'a sua aparência' };
  const CAMPOS_COR = {
    painel: [
      ['principal', 'Cor principal', 'Menu lateral, logo e títulos'],
      ['acao', 'Cor de ação', 'Botões, seleção e links'],
      ['acento', 'Cor de destaque', 'Um destaque por tela e a aba ativa'],
      ['fundo', 'Fundo', 'Atrás dos cartões'],
    ],
    portal: [
      ['principal', 'Cor principal', 'Topo do portal, títulos e pinos do mapa'],
      ['acao', 'Cor de ação', 'Botões e links'],
      ['acento', 'Cor de destaque', 'Filete do topo e aba ativa'],
      ['fundo', 'Fundo', 'Atrás dos cartões'],
    ],
  };
  // Neutros da prévia em cada modo (os de tokens.css e de css/cidadao.css).
  const NEUTROS = {
    claro: { '--cartao': '#ffffff', '--texto': '#17262b', '--suave': '#5b6b70', '--borda': '#dde5e6', '--sup-3': '#eef3f3', '--critica': '#dc2626', '--critica-fundo': '#fef2f2', '--critica-texto': '#b91c1c' },
    escuro: { '--fundo': '#0b1d22', '--cartao': '#11292f', '--texto': '#e7eff1', '--suave': '#9fb3b8', '--borda': '#24454e', '--sup-3': '#17343c', '--critica': '#f87171', '--critica-fundo': '#2a1519', '--critica-texto': '#fca5a5' },
  };
  // No noturno do portal, os títulos ficam claros (css/cidadao.css).
  const NEUTROS_PORTAL = { claro: {}, escuro: { '--titulo': '#e7eff1' } };

  // opcoes: { aoAplicar({ nivel, aparencia, marca }) -> { ok, motivo }, aoAplicarPortal(dados) -> { ok, motivo, erros },
  //           aoVoltarPadrao(nivel) -> { ok }, aoRestaurarMarca() -> { ok } }
  GC.criarTelaPersonalizar = function (el, opcoes) {
    let estado = null; // { usuario, cfg, nomeArea, cidadeNome, perfilRotulo }
    let nivel = null;
    let alvo = 'painel'; // 'painel' | 'portal' (só no padrão de todos, só o gestor geral)
    let rascunho = null; // { aparencia, marca, portal: { segue, aparencia, atendimento, assinatura } }
    let salvoPainel = '';
    let salvoPortal = '';
    let modoPrevia = 'claro';
    let aviso = null; // { texto, tipo }
    let errosPortal = {};

    const niveis = () => GC.niveisDoUsuario(estado.usuario);
    const config = () => estado.cfg.ler();
    const podeMarca = () => nivel === 'prefeitura' && GC.podePersonalizar(estado.usuario, 'prefeitura', 'marca');
    const noPortal = () => alvo === 'portal' && podeMarca();
    const travado = () => nivel === 'pessoal' && !GC.podePersonalizar(estado.usuario, 'pessoal', 'aparencia', config());
    // Cores desligadas: nível travado, ou portal que usa as mesmas cores do painel.
    const coresTravadas = () => travado() || (noPortal() && rascunho.portal.segue);
    const ap = () => (noPortal() ? rascunho.portal.aparencia : rascunho.aparencia);
    const marcaSalva = () => { const m = estado.cfg.marca(); return { nome: m.nome, nomeCabecalho: m.nomeCabecalho, nomeOficial: m.nomeOficial, slogan: m.slogan, logo: m.logo, assistente: m.assistente, entrada: m.entrada, permitirPessoal: config().prefeitura.permitirPessoal !== false }; };
    const assinarPainel = () => JSON.stringify([rascunho.aparencia, podeMarca() ? rascunho.marca : null]);
    const assinarPortal = () => (podeMarca() ? JSON.stringify(rascunho.portal) : '');
    const mudouPainel = () => assinarPainel() !== salvoPainel;
    const mudouPortal = () => assinarPortal() !== salvoPortal;
    const mudou = () => mudouPainel() || mudouPortal();

    function carregarNivel(n) {
      nivel = n;
      const proprio = estado.cfg.doNivel(n, estado.usuario);
      const aparencia = proprio ? GC.normalizarAparencia(proprio) : estado.cfg.herdado(n, estado.usuario).aparencia;
      const p = estado.cfg.portal();
      rascunho = {
        aparencia: JSON.parse(JSON.stringify(aparencia)),
        marca: marcaSalva(),
        portal: { segue: p.segue, aparencia: JSON.parse(JSON.stringify(p.aparencia)), atendimento: Object.assign({}, p.atendimento), assinatura: p.assinatura },
      };
      salvoPainel = assinarPainel();
      salvoPortal = assinarPortal();
      errosPortal = {};
      if (!podeMarca()) alvo = 'painel';
    }

    function nomeNivel(n) {
      if (n === 'pasta') return `Padrão da ${estado.nomeArea}`;
      return GC.NIVEIS_PERSONALIZACAO[n].nome;
    }

    function desenhar() {
      const u = estado.usuario;
      if (!u || !niveis().length) {
        el.innerHTML = '<header class="sec-topo"><div><h2>🎨 Personalização</h2></div></header><p class="ct-vazio">Este perfil não personaliza o painel.</p>';
        return;
      }
      const r = estado.cfg.resolver(u);
      const proprio = estado.cfg.doNivel(nivel, u);
      const herd = estado.cfg.herdado(nivel, u);
      const portal = noPortal();
      el.innerHTML = `
        <header class="sec-topo"><div><h2>🎨 Personalização</h2>
          <p>Cores, fonte, nome e logo do painel e do Portal do Cidadão. Confira na prévia antes de aplicar.</p></div></header>
        <div class="pz-niveis" role="radiogroup" aria-label="Para quem vale a mudança">
          ${niveis().map((n) => `<button type="button" role="radio" class="pz-nivel" data-nivel="${n}" aria-checked="${n === nivel}">
            <i class="ti ti-${n === 'pessoal' ? 'user' : n === 'pasta' ? 'building' : 'users-group'}" aria-hidden="true"></i>
            <span><b>${esc(nomeNivel(n))}</b><small>${esc(GC.NIVEIS_PERSONALIZACAO[n].quem)}</small></span></button>`).join('')}
        </div>
        ${podeMarca() ? `<div class="pz-alvos-linha"><nav class="us-abas pz-alvos" role="tablist" aria-label="O que você está personalizando">
          <a role="tab" href="#" data-alvo="painel" aria-selected="${!portal}"><i class="ti ti-layout-dashboard" aria-hidden="true"></i> Painel dos gestores</a>
          <a role="tab" href="#" data-alvo="portal" aria-selected="${portal}"><i class="ti ti-world" aria-hidden="true"></i> Portal do Cidadão</a>
        </nav><a class="ct-link pz-ver-portal" target="_blank" rel="noopener"><i class="ti ti-external-link" aria-hidden="true"></i> Abrir o portal</a></div>` : ''}
        ${portal
          ? '<p class="pz-origem"><i class="ti ti-info-circle" aria-hidden="true"></i> <span>O portal é aberto a qualquer pessoa, sem conta: vale um padrão só. O modo noturno segue o celular de cada morador.</span></p>'
          : `<p class="pz-origem"><i class="ti ti-info-circle" aria-hidden="true"></i> <span>Hoje você vê <b>${esc(ORIGEM[r.origem])}</b>.${proprio ? '' : ` Este nível ainda não tem aparência própria e segue ${esc(ORIGEM[herd.origem])}.`}</span></p>`}
        ${travado() ? '<p class="pz-trava"><i class="ti ti-lock" aria-hidden="true"></i> <span>O gestor geral definiu uma aparência única para todos. Para mudar, fale com o Gabinete.</span></p>' : ''}
        <div class="pz-grade">
          <div class="pz-col">
            ${portal ? `<label class="rel-cartao pz-cartao pz-check pz-segue"><input type="checkbox" data-segue${rascunho.portal.segue ? ' checked' : ''}>
              <span>Usar as mesmas cores do painel<small>O portal acompanha o "Padrão de todos" do painel. Desmarque para escolher outra paleta só para o portal.</small></span></label>` : ''}
            <section class="rel-cartao pz-cartao" aria-labelledby="pz-modelos-tit">
              <h3 id="pz-modelos-tit">Modelos</h3>
              <p class="ct-sub">Comece por um modelo e ajuste o que quiser na personalização avançada.</p>
              <div class="pz-modelos">${GC.MODELOS_APARENCIA.map((m) => `
                <button type="button" class="pz-modelo" data-modelo="${m.id}" aria-pressed="false">
                  <span class="pz-amostras" aria-hidden="true">${['principal', 'acao', 'acento', 'fundo'].map((k) => `<i style="background:${m.cores[k]}"></i>`).join('')}</span>
                  <b>${esc(m.nome)}</b><small>${esc(m.descricao)}</small>
                  <i class="ti ti-circle-check-filled pz-modelo-ok" aria-hidden="true"></i></button>`).join('')}
              </div>
            </section>
            <details class="rel-cartao pz-cartao pz-avancado"${GC.aparenciaAjustada(ap()) ? ' open' : ''}>
              <summary><h3>Personalização avançada</h3><span class="pz-ajustado" hidden>ajustado</span></summary>
              <div class="pz-cores">${CAMPOS_COR[portal ? 'portal' : 'painel'].map(([k, nome, dica]) => `
                <div class="pz-cor">
                  <label for="pz-cor-${k}"><b>${nome}</b><small>${dica}</small></label>
                  <span class="pz-cor-campos"><input type="color" id="pz-cor-${k}" data-cor="${k}" aria-label="${nome}">
                  <input type="text" class="pz-hex" data-hex="${k}" maxlength="7" spellcheck="false" autocomplete="off" aria-label="${nome} em hexadecimal"></span>
                </div>`).join('')}
              </div>
              <label class="ct-campo pz-fonte">Fonte dos títulos
                <select data-fonte>${GC.FONTES_TITULO.map((f) => `<option value="${f.id}">${esc(f.nome)}</option>`).join('')}</select></label>
              <div class="pz-contraste" aria-live="polite"></div>
            </details>
            ${portal ? desenharAtendimento() : desenharMarca(u)}
            ${!portal && podeMarca() ? desenharAssistente() + desenharEntrada() : ""}
          </div>
          <aside class="pz-previa-col" aria-label="Prévia">
            <div class="pz-previa-cab"><h3>Prévia${portal ? ' do portal' : ''}</h3>
              <span class="pz-modos" role="radiogroup" aria-label="Modo da prévia">
                <button type="button" role="radio" data-modo="claro" aria-checked="${modoPrevia === 'claro'}"><i class="ti ti-sun" aria-hidden="true"></i> Claro</button>
                <button type="button" role="radio" data-modo="escuro" aria-checked="${modoPrevia === 'escuro'}"><i class="ti ti-moon" aria-hidden="true"></i> Noturno</button>
              </span></div>
            <div class="pz-previa${portal ? ' pz-previa-portal' : ''}" data-assistente-fixo></div>
            <p class="ct-sub pz-previa-nota">${portal
              ? 'Os avisos urgentes continuam em vermelho e as cores do mapa por tipo de serviço não mudam.'
              : 'O mapa, os alertas e as cores de gravidade não mudam: vermelho continua sendo crítico em qualquer paleta.'}</p>
          </aside>
        </div>
        <div class="pz-barra">
          <p class="pz-msg" role="status"></p>
          <span class="pz-botoes">
            ${proprio && !portal ? `<button type="button" class="btn-sec pz-padrao"><i class="ti ti-arrow-back-up" aria-hidden="true"></i> ${nivel === 'prefeitura' ? 'Voltar à marca original' : 'Voltar ao padrão'}</button>` : ''}
            <button type="button" class="btn-sec pz-descartar"><i class="ti ti-x" aria-hidden="true"></i> Descartar mudanças</button>
            <button type="button" class="btn-primario pz-aplicar"><i class="ti ti-check" aria-hidden="true"></i> Aplicar</button>
          </span>
        </div>`;
      const ver = el.querySelector('.pz-ver-portal');
      if (ver) ver.href = GC.urlDoPerfil ? GC.urlDoPerfil('cidadao') : 'cidadao.html';
      ligar();
      sincronizar();
    }

    const podeRestaurarExemplo = () => GC.podePersonalizar(estado.usuario, 'prefeitura', 'marca');

    // ---- Assistente (IA): nome, como se refere a ela e rosto. Só no "Padrão de todos", só o gestor geral ----
    // O rosto da prévia é desenhado aqui (cor e máscara em linha): o .maia-rosto da página é o que já vale.
    function rostoHtml(a, extra = '') {
      const n = GC.normalizarAssistente(a);
      if (n.foto) return `<span class="pz-rosto${extra}" style="background:var(--cartao) url('${esc(n.foto)}') center / cover no-repeat" aria-hidden="true"></span>`;
      const m = `url('${esc(GC.mascaraAssistente(n))}') center / contain no-repeat`;
      return `<span class="pz-rosto${extra}" style="background:${n.cor}" aria-hidden="true"><i style="-webkit-mask:${m};mask:${m}"></i></span>`;
    }
    const FALA_EXEMPLO = 'Bom dia! A Maia separou 3 alertas que pedem você. Pergunte à Maia sobre qualquer bairro.';
    const erroAssistente = () => GC.conferirNomeAssistente(rascunho.marca.assistente.nome);
    function desenharAssistente() {
      const a = rascunho.marca.assistente;
      const erro = erroAssistente();
      return `<section class="rel-cartao pz-cartao pz-assistente" aria-labelledby="pz-ia-tit" data-assistente-fixo>
          <h3 id="pz-ia-tit">Assistente (IA)</h3>
          <p class="ct-sub">O nome e o rosto de quem responde no painel: conversa, avisos, ações prontas e arquivos. Vale para todos.</p>
          <label class="ct-campo">Nome da assistente<input type="text" data-ia="nome" maxlength="20" value="${esc(a.nome)}" placeholder="Maia" autocomplete="off" spellcheck="false"${erro ? ' aria-invalid="true"' : ''} aria-describedby="pz-ia-nome-dica"></label>
          <small id="pz-ia-nome-dica" class="pz-dica${erro ? ' pz-erro' : ''}">${esc(erro || 'Um nome curto e fácil de falar. Ex.: Iara, Clara, Léo.')}</small>
          <fieldset class="pz-escolha-linha"><legend>Os textos falam</legend>
            <label><input type="radio" name="pz-ia-genero" data-ia="genero" value="f"${a.genero === 'f' ? ' checked' : ''}> "a ${esc(a.nome)}" (ela)</label>
            <label><input type="radio" name="pz-ia-genero" data-ia="genero" value="m"${a.genero === 'm' ? ' checked' : ''}> "o ${esc(a.nome)}" (ele)</label>
          </fieldset>
          <div class="pz-ia-rosto">
            <span class="pz-ia-rosto-tit"><b>Rosto</b><small>Uma forma vazada sobre a cor, ou uma foto redonda.</small></span>
            <div class="pz-formas" role="radiogroup" aria-label="Forma do rosto">${GC.FORMAS_ASSISTENTE.map((f) => `
              <button type="button" role="radio" class="pz-forma" data-forma="${f.id}" aria-checked="${!a.foto && a.forma === f.id}" title="${esc(f.nome)}">
                ${rostoHtml(Object.assign({}, a, { forma: f.id, foto: null }))}<span>${esc(f.nome)}</span></button>`).join('')}
            </div>
            <div class="pz-cor pz-ia-cor">
              <label for="pz-ia-cor"><b>Cor da assistente</b><small>Rosto, balões e selos do que vem dela</small></label>
              <span class="pz-cor-campos"><input type="color" id="pz-ia-cor" data-ia="cor" value="${a.cor}" aria-label="Cor da assistente">
              <input type="text" class="pz-hex" data-ia="corHex" maxlength="7" spellcheck="false" autocomplete="off" value="${a.cor}" aria-label="Cor da assistente em hexadecimal"></span>
            </div>
            <span class="pz-logo-acoes">
              <label class="btn-sec pz-enviar"><i class="ti ti-photo-up" aria-hidden="true"></i> ${a.foto ? 'Trocar a foto' : 'Usar uma foto'}<input type="file" data-ia="foto" accept="image/png,image/jpeg,image/webp" class="so-leitor"></label>
              ${a.foto ? '<button type="button" class="ct-link" data-ia="tirar-foto">Voltar à forma</button>' : ''}
              <small class="pz-dica">PNG, JPG ou WebP. A foto é cortada em círculo.</small>
            </span>
          </div>
          <div class="pz-ia-amostra" aria-live="polite"></div>
          <button type="button" class="ct-link pz-ia-padrao"><i class="ti ti-arrow-back-up" aria-hidden="true"></i> Voltar à Maia</button>
        </section>`;
    }
    // Atualiza só a amostra, as formas e o erro (o campo do nome fica como está, com o cursor no lugar).
    function atualizarAssistente() {
      const cartao = el.querySelector('.pz-assistente');
      if (!cartao) return;
      const a = rascunho.marca.assistente;
      const erro = erroAssistente();
      const nome = erro ? 'Maia' : a.nome;
      const ok = Object.assign({}, a, { nome });
      cartao.querySelector('.pz-ia-amostra').innerHTML = `<span class="pz-ia-balao-autor">${rostoHtml(ok)} <b>${esc(nome)}</b></span>
        <p>${esc(GC.trocarNomeAssistente(FALA_EXEMPLO, ok))}</p>`;
      cartao.querySelectorAll('.pz-forma').forEach((b) => {
        b.setAttribute('aria-checked', String(!a.foto && b.dataset.forma === a.forma));
        b.querySelector('.pz-rosto').outerHTML = rostoHtml(Object.assign({}, ok, { forma: b.dataset.forma, foto: null }));
      });
      cartao.querySelectorAll('[data-ia="genero"]').forEach((r) => { r.parentElement.lastChild.nodeValue = ` "${r.value === 'm' ? 'o' : 'a'} ${nome}" (${r.value === 'm' ? 'ele' : 'ela'})`; });
      const nomeIn = cartao.querySelector('[data-ia="nome"]');
      const dica = cartao.querySelector('#pz-ia-nome-dica');
      if (erro) nomeIn.setAttribute('aria-invalid', 'true'); else nomeIn.removeAttribute('aria-invalid');
      dica.className = `pz-dica${erro ? ' pz-erro' : ''}`;
      dica.textContent = erro || 'Um nome curto e fácil de falar. Ex.: Iara, Clara, Léo.';
      cartao.querySelector('.pz-ia-padrao').hidden = JSON.stringify(GC.normalizarAssistente(a)) === JSON.stringify(GC.normalizarAssistente(null)) && !erro;
    }

    // ---- Entrada do painel: fundo do login e da abertura, e a transição de um para o outro ----
    function desenharEntrada() {
      const e = rascunho.marca.entrada;
      const opcao = (lista, nome, atual, attr) => lista.map((o) => `<label class="pz-opcao"><input type="radio" name="${nome}" ${attr} value="${o.id}"${o.id === atual ? ' checked' : ''}>
        <span><b>${esc(o.nome)}</b><small>${esc(o.descricao)}</small></span></label>`).join('');
      return `<section class="rel-cartao pz-cartao pz-entrada" aria-labelledby="pz-en-tit">
          <h3 id="pz-en-tit">Entrada do painel</h3>
          <p class="ct-sub">O fundo da tela de login e da abertura do painel, e a passagem de uma para a outra.</p>
          <div class="pz-en-grade">
            <div class="pz-en-campos">
              <fieldset class="pz-opcoes"><legend>Fundo</legend>${opcao(GC.ESTILOS_FUNDO_ENTRADA, 'pz-en-estilo', e.estilo, 'data-en="estilo"')}</fieldset>
              <div class="pz-en-imagem"${e.estilo === 'imagem' || e.imagem ? '' : ' hidden'}>
                <span class="pz-logo-acoes">
                  <label class="btn-sec pz-enviar"><i class="ti ti-photo-up" aria-hidden="true"></i> ${e.imagem ? 'Trocar a imagem' : 'Enviar imagem'}<input type="file" data-en="imagem" accept="image/png,image/jpeg,image/webp" class="so-leitor"></label>
                  <small class="pz-dica">JPG, PNG ou WebP. Fotos grandes são reduzidas para 1600 px.</small>
                </span>
                <label class="ct-campo pz-en-veu">Véu na cor principal <output data-en-veu>${e.veu}%</output>
                  <input type="range" min="20" max="85" step="5" value="${e.veu}" data-en="veu" aria-describedby="pz-en-veu-dica"></label>
                <small id="pz-en-veu-dica" class="pz-dica">Mais véu, mais fácil de ler o texto branco por cima.</small>
              </div>
              <fieldset class="pz-opcoes"><legend>Transição do login ao painel</legend>${opcao(GC.TRANSICOES_ENTRADA, 'pz-en-trans', e.transicao, 'data-en="transicao"')}</fieldset>
            </div>
            <div class="pz-en-previa-col">
              <div class="pz-en-previa" aria-hidden="true"></div>
              <button type="button" class="btn-sec pz-en-tocar"><i class="ti ti-player-play" aria-hidden="true"></i> Ver a transição</button>
            </div>
          </div>
        </section>`;
    }
    function atualizarEntrada() {
      const cartao = el.querySelector('.pz-entrada');
      if (!cartao) return;
      const e = rascunho.marca.entrada;
      const principal = rascunho.aparencia.cores.principal;
      const css = GC.fundoEntradaCss(e, principal);
      const m = rascunho.marca;
      const prev = cartao.querySelector('.pz-en-previa');
      prev.className = `pz-en-previa${css === null ? ' pz-en-grafismo' : ''}`;
      prev.style.background = css || principal;
      prev.style.setProperty('--en-principal', principal);
      prev.innerHTML = `<span class="pz-en-logo">${m.logo ? `<img src="${esc(m.logo)}" alt="">` : `<img src="${esc(GC.personalizacao.LOGO_PADRAO)}" alt="">`}</span>
        <span class="pz-en-txt"><b>${esc(m.nomeCabecalho || estado.cidadeNome)}</b>${m.slogan ? `<small>${esc(m.slogan)}</small>` : ''}</span>
        <span class="pz-en-form"></span>`;
      cartao.querySelector('.pz-en-imagem').hidden = e.estilo !== 'imagem';
      const veu = cartao.querySelector('[data-en-veu]');
      if (veu) veu.textContent = `${e.veu}%`;
      cartao.querySelector('.pz-en-tocar').disabled = e.transicao === 'direta';
    }
    // A transição na miniatura: a capa abre da esquerda ou aparece aos poucos, e volta.
    function tocarTransicao() {
      const prev = el.querySelector('.pz-en-previa');
      const e = rascunho.marca.entrada;
      if (!prev || e.transicao === 'direta') return;
      prev.querySelectorAll('.pz-en-capa').forEach((c) => c.remove());
      const capa = document.createElement('span');
      capa.className = `pz-en-capa pz-en-capa-${e.transicao}`;
      const css = GC.fundoEntradaCss(e, rascunho.aparencia.cores.principal);
      capa.style.background = css || rascunho.aparencia.cores.principal;
      capa.innerHTML = `<img src="${esc(rascunho.marca.logo || 'identidade-visual/logo/svg/vertical-escuro.svg')}" alt=""><i></i>`;
      prev.appendChild(capa);
      capa.getBoundingClientRect();
      capa.classList.add('aberta');
      setTimeout(() => capa.remove(), 2200);
    }
    // Foto ou imagem enviada: reduzida no navegador (JPEG) antes de guardar, para caber no armazenamento.
    function reduzirImagem(arquivo, maxLado, limite, pronto) {
      if (!arquivo || !/^image\/(png|jpeg|webp)$/.test(arquivo.type)) { pronto(null, 'Use JPG, PNG ou WebP.'); return; }
      if (arquivo.size > 8 * 1024 * 1024) { pronto(null, 'Imagem grande demais (mais de 8 MB).'); return; }
      const leitor = new FileReader();
      leitor.onload = () => {
        const img = new Image();
        img.onload = () => {
          const k = Math.min(1, maxLado / Math.max(img.width, img.height));
          const c = document.createElement('canvas');
          c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          const url = c.toDataURL('image/jpeg', 0.82);
          if (url.length * 0.75 > limite) pronto(null, 'A imagem ainda ficou pesada. Tente uma menor.'); else pronto(url);
        };
        img.onerror = () => pronto(null, 'Não deu para abrir esta imagem.');
        img.src = leitor.result;
      };
      leitor.readAsDataURL(arquivo);
    }
    function ligarAssistenteEEntrada() {
      const cia = el.querySelector('.pz-assistente');
      if (cia) {
        const a = () => rascunho.marca.assistente;
        const mudou = () => { aviso = null; atualizarAssistente(); sincronizar(); };
        cia.querySelector('[data-ia="nome"]').oninput = (ev) => { a().nome = ev.target.value; mudou(); };
        cia.querySelectorAll('[data-ia="genero"]').forEach((r) => { r.onchange = () => { a().genero = r.value; mudou(); }; });
        cia.querySelectorAll('.pz-forma').forEach((b) => { b.onclick = () => { a().forma = b.dataset.forma; a().foto = null; redesenharAssistente(); }; });
        const cor = cia.querySelector('[data-ia="cor"]');
        const hex = cia.querySelector('[data-ia="corHex"]');
        cor.oninput = () => { a().cor = cor.value.toLowerCase(); hex.value = a().cor; mudou(); };
        hex.oninput = () => { let t = hex.value.trim(); if (t && t[0] !== '#') t = `#${t}`; if (GC.corValida(t)) { a().cor = t.toLowerCase(); cor.value = a().cor; hex.removeAttribute('aria-invalid'); mudou(); } else hex.setAttribute('aria-invalid', 'true'); };
        hex.onblur = () => { hex.value = a().cor; hex.removeAttribute('aria-invalid'); };
        const foto = cia.querySelector('[data-ia="foto"]');
        foto.onchange = () => reduzirImagem(foto.files[0], 256, GC.FOTO_ASSISTENTE_MAX_BYTES, (url, erro) => {
          if (erro) { aviso = { texto: `<i class="ti ti-alert-triangle" aria-hidden="true"></i> ${esc(erro)}`, tipo: 'erro' }; mensagem(); return; }
          a().foto = url; redesenharAssistente();
        });
        const tirar = cia.querySelector('[data-ia="tirar-foto"]');
        if (tirar) tirar.onclick = () => { a().foto = null; redesenharAssistente(); };
        cia.querySelector('.pz-ia-padrao').onclick = () => { rascunho.marca.assistente = GC.normalizarAssistente(null); redesenharAssistente(); };
      }
      const cen = el.querySelector('.pz-entrada');
      if (cen) {
        const e = () => rascunho.marca.entrada;
        const mudou = () => { aviso = null; atualizarEntrada(); sincronizar(); };
        cen.querySelectorAll('[data-en="estilo"]').forEach((r) => { r.onchange = () => { e().estilo = r.value; mudou(); if (r.value === 'imagem' && !e().imagem) cen.querySelector('[data-en="imagem"]').click(); }; });
        cen.querySelectorAll('[data-en="transicao"]').forEach((r) => { r.onchange = () => { e().transicao = r.value; mudou(); tocarTransicao(); }; });
        cen.querySelector('[data-en="veu"]').oninput = (ev) => { e().veu = Number(ev.target.value); mudou(); };
        const img = cen.querySelector('[data-en="imagem"]');
        img.onchange = () => reduzirImagem(img.files[0], 1600, GC.FUNDO_MAX_BYTES, (url, erro) => {
          if (erro) { aviso = { texto: `<i class="ti ti-alert-triangle" aria-hidden="true"></i> ${esc(erro)}`, tipo: 'erro' }; mensagem(); return; }
          e().imagem = url; e().estilo = 'imagem'; redesenharEntrada();
        });
        cen.querySelector('.pz-en-tocar').onclick = tocarTransicao;
      }
    }
    function redesenharAssistente() { const c = el.querySelector('.pz-assistente'); if (c) { c.outerHTML = desenharAssistente(); ligar(); sincronizar(); } }
    function redesenharEntrada() { const c = el.querySelector('.pz-entrada'); if (c) { c.outerHTML = desenharEntrada(); ligar(); sincronizar(); } }

    function desenharMarca(u) {
      if (podeMarca()) {
        const m = rascunho.marca;
        return `<section class="rel-cartao pz-cartao pz-marca" aria-labelledby="pz-marca-tit">
          <h3 id="pz-marca-tit">Nome e logo</h3>
          <p class="ct-sub">Valem para todos, em qualquer nível, e também no Portal do Cidadão. Só o gestor geral muda.</p>
          <label class="ct-campo">Nome da plataforma<input type="text" data-marca="nome" maxlength="40" value="${esc(m.nome)}" aria-describedby="pz-nome-dica"></label>
          <small id="pz-nome-dica" class="pz-dica">Aparece na aba do navegador e no texto do logo. Ex.: "Painel da Prefeitura".</small>
          <label class="ct-campo">Nome no cabeçalho<input type="text" data-marca="nomeCabecalho" maxlength="40" value="${esc(m.nomeCabecalho)}" placeholder="${esc(estado.cidadeNome)}"></label>
          <label class="ct-campo">Nome oficial nos documentos<input type="text" data-marca="nomeOficial" maxlength="70" value="${esc(m.nomeOficial)}" placeholder="${esc(GC.nomeOficialPrefeitura(null, estado.cidadeNome))}" aria-describedby="pz-oficial-dica"></label>
          <small id="pz-oficial-dica" class="pz-dica">Assina os relatórios em PDF, Word e Excel e os arquivos da Maia.</small>
          <label class="ct-campo">Slogan da gestão (opcional)<input type="text" data-marca="slogan" maxlength="70" value="${esc(m.slogan)}" placeholder="Gestão 2025–2028 · Cidade que cuida" aria-describedby="pz-slogan-dica"></label>
          <small id="pz-slogan-dica" class="pz-dica">Aparece na entrada do painel, no rodapé do Portal do Cidadão e no topo dos relatórios.</small>
          <div class="pz-logo">
            <span class="pz-logo-amostra"><img alt="Logo atual" src="${esc(m.logo || GC.personalizacao.LOGO_PADRAO)}"></span>
            <span class="pz-logo-acoes">
              <label class="btn-sec pz-enviar"><i class="ti ti-upload" aria-hidden="true"></i> Enviar logo<input type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" class="so-leitor"></label>
              ${m.logo ? '<button type="button" class="ct-link pz-logo-tirar">Usar o logo original</button>' : ''}
              <small class="pz-dica">PNG, JPG, SVG ou WebP, até ${GC.LOGO_MAX_BYTES / 1024} KB. Prefira um logo claro e horizontal: ele fica sobre a cor principal.</small>
            </span>
          </div>
          <label class="pz-check"><input type="checkbox" data-marca="permitirPessoal"${m.permitirPessoal ? ' checked' : ''}> <span>Cada pessoa pode escolher a própria aparência<small>Desmarcado, todos veem o padrão de todos ou o da secretaria.</small></span></label>
          <button type="button" class="ct-link pz-marca-original"><i class="ti ti-arrow-back-up" aria-hidden="true"></i> Restaurar nome e logo originais</button>
          ${estado.cfg.temExemplo && estado.cfg.temExemplo() && !estado.cfg.noExemplo() && podeRestaurarExemplo() ? '<button type="button" class="ct-link pz-restaurar-exemplo"><i class="ti ti-restore" aria-hidden="true"></i> Restaurar o exemplo da demonstração</button>' : ''}
        </section>`;
      }
      if (!GC.pode('aparencia.marca', null, { perfil: { id: u.perfil, area: u.area }, usuario: u })) {
        return '<p class="pz-trava pz-trava-marca"><i class="ti ti-lock" aria-hidden="true"></i> <span>Nome da plataforma, logo, assistente e entrada do painel: só o gestor geral muda.</span></p>';
      }
      return '<p class="pz-trava pz-trava-marca"><i class="ti ti-info-circle" aria-hidden="true"></i> <span>Nome, logo, assistente, entrada do painel e o Portal do Cidadão ficam em "Padrão de todos".</span></p>';
    }

    // Portal: atendimento ao cidadão e a assinatura do rodapé. Nome e logo vêm da aba do painel.
    function desenharAtendimento() {
      const a = rascunho.portal.atendimento;
      const campo = (k, rotulo, dica, extra) => `<label class="ct-campo">${rotulo}<input type="text" data-atendimento="${k}" value="${esc(a[k])}" ${extra}${errosPortal[k] ? ' aria-invalid="true"' : ''} aria-describedby="pz-at-${k}"></label>
        <small id="pz-at-${k}" class="pz-dica${errosPortal[k] ? ' pz-erro' : ''}">${esc(errosPortal[k] || dica)}</small>`;
      return `<section class="rel-cartao pz-cartao pz-marca" aria-labelledby="pz-at-tit">
          <h3 id="pz-at-tit">Atendimento ao cidadão</h3>
          <p class="ct-sub">Aparece em "Serviços e contatos", nas perguntas frequentes e na busca do portal.</p>
          ${campo('telefone', 'Telefone da Prefeitura', 'Obrigatório. Ex.: 156 ou 0800 123 4567.', 'inputmode="tel" maxlength="20" autocomplete="off"')}
          ${campo('whatsapp', 'WhatsApp (opcional)', 'Com DDD. Vira um botão "WhatsApp" em Serviços.', 'inputmode="tel" maxlength="20" autocomplete="off" placeholder="11 91234-5678"')}
          ${campo('email', 'E-mail da ouvidoria (opcional)', 'Vira um link "Ouvidoria" em Serviços.', 'type="email" maxlength="80" autocomplete="off" placeholder="ouvidoria@prefeitura.gov.br"')}
        </section>
        <section class="rel-cartao pz-cartao" aria-labelledby="pz-rodape-tit">
          <h3 id="pz-rodape-tit">Marca e rodapé</h3>
          <p class="ct-sub">O logo e o nome do topo do portal são os da aba "Painel dos gestores".</p>
          <label class="pz-check"><input type="checkbox" data-assinatura${rascunho.portal.assinatura ? ' checked' : ''}> <span>Mostrar "Feito com o Golden Atlas" no rodapé</span></label>
        </section>`;
    }

    // ---- campos → rascunho → prévia (sem redesenhar a tela inteira: o foco e a digitação ficam onde estão) ----
    function sincronizar() {
      const a = ap();
      const off = coresTravadas();
      el.querySelectorAll('[data-cor]').forEach((i) => { i.value = a.cores[i.dataset.cor]; i.disabled = off; });
      el.querySelectorAll('[data-hex]').forEach((i) => { if (document.activeElement !== i) i.value = a.cores[i.dataset.hex]; i.disabled = off; i.removeAttribute('aria-invalid'); });
      const fonte = el.querySelector('[data-fonte]');
      fonte.value = a.fonte;
      fonte.disabled = off;
      el.querySelectorAll('.pz-modelo').forEach((b) => {
        b.setAttribute('aria-pressed', String(b.dataset.modelo === a.modelo));
        b.disabled = off;
      });
      el.querySelector('.pz-ajustado').hidden = !GC.aparenciaAjustada(a);
      el.querySelector('.pz-contraste').innerHTML = `<h4>Leitura</h4><ul>${GC.conferirContraste(a).map((c) => `<li class="${c.ok ? 'ok' : 'baixo'}"><i class="ti ti-${c.ok ? 'circle-check' : 'alert-triangle'}" aria-hidden="true"></i><span>${esc(noPortal() ? c.texto.replace(' (menu)', ' (topo)') : c.texto)}</span><b>${String(c.razao).replace('.', ',')}:1</b><span class="so-leitor">${c.ok ? 'boa leitura' : `abaixo do mínimo de ${c.minimo}:1`}</span></li>`).join('')}</ul>`;
      if (noPortal()) desenharPreviaPortal(); else desenharPrevia();
      el.querySelector('.pz-aplicar').disabled = travado() || !mudou();
      el.querySelector('.pz-descartar').disabled = !mudou();
      el.querySelector('.pz-barra').classList.toggle('pz-barra-pendente', mudou());
      // A amostra do logo fica sobre a cor principal que está sendo escolhida, não sobre a de agora.
      const amostra = el.querySelector('.pz-logo-amostra');
      if (amostra) amostra.style.background = rascunho.aparencia.cores.principal;
      atualizarAssistente();
      atualizarEntrada();
      mensagem();
    }

    function mensagem() {
      const p = el.querySelector('.pz-msg');
      if (aviso) { p.className = `pz-msg ct-msg-${aviso.tipo}`; p.innerHTML = aviso.texto; return; }
      const partes = [mudouPainel() && 'painel', mudouPortal() && 'portal'].filter(Boolean);
      p.className = partes.length ? 'pz-msg pz-msg-pendente' : 'pz-msg';
      p.textContent = !partes.length ? 'Nenhuma mudança por aplicar.' : podeMarca() ? `Mudanças ainda não aplicadas (${partes.join(' e ')}).` : 'Mudanças ainda não aplicadas.';
    }

    function estiloPrevia(vars) {
      return Object.entries(vars).filter(([, x]) => x).map(([k, x]) => `${k}:${x}`).join(';');
    }

    function desenharPrevia() {
      const v = Object.assign({}, GC.variaveisAparencia(rascunho.aparencia)[modoPrevia], NEUTROS[modoPrevia]);
      if (modoPrevia === 'claro') v['--fundo'] = rascunho.aparencia.cores.fundo;
      const m = podeMarca() ? rascunho.marca : estado.cfg.marca();
      const cab = m.nomeCabecalho || estado.cidadeNome;
      const prev = el.querySelector('.pz-previa');
      prev.setAttribute('style', estiloPrevia(v));
      prev.classList.toggle('pz-previa-escuro', modoPrevia === 'escuro');
      prev.innerHTML = `
        <div class="pz-m-aba" aria-hidden="true"><i class="ti ti-world" aria-hidden="true"></i> ${esc(cab)} · ${esc(m.nome)}</div>
        <div class="pz-m" aria-hidden="true">
          <div class="pz-m-menu">
            <img class="pz-m-logo" src="${esc(m.logo || GC.personalizacao.LOGO_PADRAO)}" alt="">
            <span class="pz-m-item ativo"><i class="ti ti-map-2"></i> Mapa</span>
            <span class="pz-m-item"><i class="ti ti-building-bank"></i> Secretarias</span>
            <span class="pz-m-item"><i class="ti ti-file-text"></i> Relatórios</span>
            <span class="pz-m-item"><i class="ti ti-urgent"></i> Crise</span>
          </div>
          <div class="pz-m-corpo">
            <div class="pz-m-topo"><span class="pz-m-tit"><b class="pz-m-nome">${esc(cab)}</b>${m.slogan ? `<small class="pz-m-slogan">${esc(m.slogan)}</small>` : ''}</span><span class="pz-m-chip">${esc(estado.perfilRotulo)}</span>
              <span class="pz-m-kpi"><b>12</b> abertas</span><span class="pz-m-kpi"><b>3</b> críticas</span>
              <span class="pz-m-bt"><i class="ti ti-bell"></i> Alertas</span><span class="pz-m-bt pz-m-ia" data-assistente-fixo>${rostoHtml(m.assistente)} ${esc(m.assistente.nome)}</span></div>
            <div class="pz-m-cartoes">
              <div class="pz-m-cartao"><h4>Leitos ocupados</h4><b class="pz-m-num">72%</b>
                <span class="pz-m-barra"><i style="width:72%"></i></span><span class="pz-m-link">Ver no mapa <i class="ti ti-arrow-right"></i></span></div>
              <div class="pz-m-cartao"><h4>Obras atrasadas <span class="pz-m-sev"><i class="ti ti-flame"></i> Crítica</span></h4>
                <p>8 de 21 obras estão atrasadas, com atraso médio de 47 dias.</p>
                <span class="pz-m-botoes"><span class="pz-m-prim">Cobrar a secretaria</span><span class="pz-m-sec">Detalhes</span></span></div>
            </div>
            <span class="pz-m-cta"><i class="ti ti-urgent"></i> Abrir gabinete de crise</span>
          </div>
        </div>`;
    }

    // Prévia do portal: um celular com o topo, um aviso, o atendimento e as abas da base.
    function desenharPreviaPortal() {
      const p = rascunho.portal;
      const v = Object.assign({}, NEUTROS[modoPrevia], GC.variaveisPortal(p.aparencia)[modoPrevia], NEUTROS_PORTAL[modoPrevia]);
      if (modoPrevia === 'claro') v['--fundo'] = p.aparencia.cores.fundo;
      const m = rascunho.marca;
      const a = p.atendimento;
      const tel = String(a.telefone || '').trim() || '156';
      const prev = el.querySelector('.pz-previa');
      prev.setAttribute('style', estiloPrevia(v));
      prev.classList.toggle('pz-previa-escuro', modoPrevia === 'escuro');
      prev.innerHTML = `
        <div class="pz-c" aria-hidden="true">
          <div class="pz-c-topo">
            <span class="pz-c-marca">${m.logo ? `<img src="${esc(m.logo)}" alt="">` : '<i class="ti ti-building-community"></i>'}</span>
            <span class="pz-c-nome">${m.nomeCabecalho ? `<b>${esc(m.nomeCabecalho)}</b>` : `<small>Prefeitura de</small><b>${esc(estado.cidadeNome)}</b>`}</span>
            <span class="pz-c-chip"><i class="ti ti-map-pin"></i> Centro</span>
          </div>
          <div class="pz-c-corpo">
            <h4>Bom dia! O que acontece hoje</h4>
            <div class="pz-c-cartao">
              <span class="pz-c-urg"><i class="ti ti-alert-triangle"></i> Urgente</span>
              <b>Rua alagada no Centro</b>
              <p>Evite a região e não atravesse ruas alagadas.</p>
              <span class="pz-c-link">Ver no mapa <i class="ti ti-arrow-right"></i></span>
            </div>
            <div class="pz-c-cartao">
              <b>Pedir um serviço</b>
              <p>Ligue <b>${esc(tel)}</b>. Diga o endereço e um ponto de referência.</p>
              <span class="pz-c-botao"><i class="ti ti-phone"></i> Ligar ${esc(tel)}</span>
              ${a.whatsapp || a.email ? `<span class="pz-c-canais">${a.whatsapp ? '<span><i class="ti ti-brand-whatsapp"></i> WhatsApp</span>' : ''}${a.email ? '<span><i class="ti ti-mail"></i> Ouvidoria</span>' : ''}</span>` : ''}
            </div>
            ${m.slogan ? `<p class="pz-c-slogan">${esc(m.slogan)}</p>` : ''}
            ${p.assinatura ? '<p class="pz-c-assina">Feito com o Golden Atlas</p>' : ''}
          </div>
          <div class="pz-c-abas"><span class="ativo"><i class="ti ti-home"></i>Início</span><span><i class="ti ti-map-2"></i>Mapa</span><span><i class="ti ti-tool"></i>Serviços</span><span><i class="ti ti-chart-bar"></i>Números</span></div>
        </div>`;
    }

    // Janela de confirmação do painel (js/desfazer-ui.js); sem ela (página sem o arquivo), a do navegador.
    function perguntar(o) {
      return GC.confirmar ? GC.confirmar(o) : Promise.resolve(window.confirm(o.titulo));
    }

    function trocarCor(k, valor) {
      ap().cores[k] = valor.toLowerCase();
      aviso = null;
      sincronizar();
    }

    function ligar() {
      el.querySelectorAll('.pz-nivel').forEach((b) => {
        b.onclick = async () => {
          if (b.dataset.nivel === nivel) return;
          if (mudou() && !(await perguntar({
            titulo: 'Descartar as mudanças?',
            texto: 'As cores, a fonte, o nome ou o logo que você mudou ainda não foram aplicados. Ao trocar de nível, eles se perdem.',
            sim: 'Descartar e trocar', nao: 'Continuar editando', perigo: true,
            nota: 'Para guardar, volte e use "Aplicar" antes de trocar.',
          }))) return;
          aviso = null;
          carregarNivel(b.dataset.nivel);
          desenhar();
          el.querySelector(`.pz-nivel[data-nivel="${nivel}"]`).focus();
        };
      });
      // Painel ou portal: trocar de aba não descarta nada (o "Aplicar" salva os dois).
      el.querySelectorAll('[data-alvo]').forEach((a) => {
        a.onclick = (ev) => {
          ev.preventDefault();
          if (a.dataset.alvo === alvo) return;
          alvo = a.dataset.alvo;
          // Portal que segue o painel mostra as cores que o painel terá.
          if (alvo === 'portal' && rascunho.portal.segue) rascunho.portal.aparencia = JSON.parse(JSON.stringify(rascunho.aparencia));
          desenhar();
          el.querySelector(`[data-alvo="${alvo}"]`).focus();
        };
      });
      el.querySelectorAll('.pz-modelo').forEach((b) => {
        b.onclick = () => {
          const m = GC.MODELOS_APARENCIA.find((x) => x.id === b.dataset.modelo);
          if (noPortal()) rascunho.portal.aparencia = GC.normalizarAparencia({ modelo: m.id });
          else rascunho.aparencia = GC.normalizarAparencia({ modelo: m.id });
          aviso = null;
          sincronizar();
        };
      });
      el.querySelectorAll('[data-cor]').forEach((i) => { i.oninput = () => trocarCor(i.dataset.cor, i.value); });
      el.querySelectorAll('[data-hex]').forEach((i) => {
        i.oninput = () => {
          let t = i.value.trim();
          if (t && t[0] !== '#') t = `#${t}`;
          if (GC.corValida(t)) { i.removeAttribute('aria-invalid'); trocarCor(i.dataset.hex, t); } else i.setAttribute('aria-invalid', 'true');
        };
        i.onblur = () => { i.value = ap().cores[i.dataset.hex]; i.removeAttribute('aria-invalid'); };
      });
      el.querySelector('[data-fonte]').onchange = (ev) => { ap().fonte = ev.target.value; aviso = null; sincronizar(); };
      el.querySelectorAll('[data-modo]').forEach((b) => {
        b.onclick = () => {
          modoPrevia = b.dataset.modo;
          el.querySelectorAll('[data-modo]').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
          if (noPortal()) desenharPreviaPortal(); else desenharPrevia();
        };
      });

      // Portal: seguir o painel, atendimento e assinatura.
      const segue = el.querySelector('[data-segue]');
      if (segue) {
        segue.onchange = () => {
          rascunho.portal.segue = segue.checked;
          if (segue.checked) rascunho.portal.aparencia = JSON.parse(JSON.stringify(rascunho.aparencia));
          aviso = null;
          sincronizar();
        };
      }
      el.querySelectorAll('[data-atendimento]').forEach((i) => {
        i.oninput = () => { rascunho.portal.atendimento[i.dataset.atendimento] = i.value; aviso = null; sincronizar(); };
      });
      const assinatura = el.querySelector('[data-assinatura]');
      if (assinatura) assinatura.onchange = () => { rascunho.portal.assinatura = assinatura.checked; aviso = null; sincronizar(); };

      // Nome e logo (só no nível de todos, só o gestor geral).
      el.querySelectorAll('input[data-marca]').forEach((i) => {
        const campo = i.dataset.marca;
        i.oninput = () => { rascunho.marca[campo] = i.type === 'checkbox' ? i.checked : i.value; aviso = null; sincronizar(); };
      });
      const arquivo = el.querySelector('.pz-enviar input');
      if (arquivo) {
        arquivo.onchange = () => {
          const f = arquivo.files[0];
          const erro = GC.conferirLogo(f);
          if (erro) { aviso = { texto: `<i class="ti ti-alert-triangle" aria-hidden="true"></i> ${esc(erro)}`, tipo: 'erro' }; mensagem(); arquivo.value = ''; return; }
          const leitor = new FileReader();
          leitor.onload = () => { rascunho.marca.logo = leitor.result; aviso = null; trocarLogo(); };
          leitor.readAsDataURL(f);
        };
      }
      const tirar = el.querySelector('.pz-logo-tirar');
      if (tirar) tirar.onclick = () => { rascunho.marca.logo = null; trocarLogo(); };
      const original = el.querySelector('.pz-marca-original');
      if (original) {
        original.onclick = async () => {
          if (!(await perguntar({
            titulo: 'Restaurar nome e logo originais?',
            texto: 'O painel e o Portal do Cidadão voltam ao nome "Golden Atlas" e ao logo original, e cada pessoa volta a poder escolher a própria aparência.',
            sim: 'Restaurar', nao: 'Cancelar', perigo: true, nota: false,
          }))) return;
          const r = opcoes.aoRestaurarMarca();
          if (r.ok) { carregarNivel(nivel); aviso = { texto: '<i class="ti ti-circle-check" aria-hidden="true"></i> Nome e logo originais de volta.', tipo: 'ok' }; desenhar(); }
        };
      }

      const restaurarExemplo = el.querySelector('.pz-restaurar-exemplo');
      if (restaurarExemplo) {
        restaurarExemplo.onclick = async () => {
          if (!(await perguntar({
            titulo: 'Restaurar o exemplo da demonstração?',
            texto: `Tudo o que foi personalizado em ${estado.cidadeNome} (cores de todos, das secretarias e de cada pessoa, nome, logo e portal) volta ao exemplo de fábrica.`,
            sim: 'Restaurar o exemplo', nao: 'Cancelar', perigo: true, nota: false,
          }))) return;
          const r = opcoes.aoRestaurarExemplo ? opcoes.aoRestaurarExemplo() : { ok: false };
          if (r.ok) { carregarNivel(nivel); aviso = { texto: '<i class="ti ti-circle-check" aria-hidden="true"></i> O exemplo da demonstração está de volta.', tipo: 'ok' }; desenhar(); }
        };
      }
      el.querySelector('.pz-descartar').onclick = () => { carregarNivel(nivel); aviso = null; desenhar(); };
      const padrao = el.querySelector('.pz-padrao');
      if (padrao) {
        padrao.onclick = () => {
          const r = opcoes.aoVoltarPadrao(nivel);
          if (!r.ok) return;
          carregarNivel(nivel);
          aviso = { texto: `<i class="ti ti-circle-check" aria-hidden="true"></i> ${nivel === 'prefeitura' ? 'Todos voltaram à marca original (menos quem tem aparência da secretaria ou própria).' : 'Pronto: este nível volta a seguir o padrão.'}`, tipo: 'ok' };
          desenhar();
        };
      }
      ligarAssistenteEEntrada();
      el.querySelector('.pz-aplicar').onclick = aplicar;
    }

    function aplicar() {
      const erro = (texto) => { aviso = { texto: `<i class="ti ti-alert-triangle" aria-hidden="true"></i> ${texto}`, tipo: 'erro' }; mensagem(); };
      if (podeMarca() && !String(rascunho.marca.nome || '').trim()) {
        if (alvo !== 'painel') { alvo = 'painel'; desenhar(); }
        erro('Digite o nome da plataforma.');
        el.querySelector('[data-marca="nome"]').focus();
        return;
      }
      if (podeMarca() && erroAssistente()) {
        if (alvo !== 'painel') { alvo = 'painel'; desenhar(); }
        erro('Confira o nome da assistente.');
        el.querySelector('[data-ia="nome"]').focus();
        return;
      }
      // O portal primeiro: se o atendimento tiver erro, nada é salvo e a aba do portal mostra onde.
      const mPortal = mudouPortal();
      const mPainel = mudouPainel();
      if (mPortal) {
        const rp = opcoes.aoAplicarPortal({ segue: rascunho.portal.segue, aparencia: rascunho.portal.aparencia, atendimento: rascunho.portal.atendimento, assinatura: rascunho.portal.assinatura });
        if (!rp.ok) {
          if (rp.motivo === 'atendimento') {
            errosPortal = rp.erros;
            alvo = 'portal';
            desenhar();
            erro('Confira os dados do atendimento ao cidadão.');
            const campo = el.querySelector(`[data-atendimento="${Object.keys(rp.erros)[0]}"]`);
            if (campo) campo.focus();
          } else erro('Você não tem permissão para mudar o Portal do Cidadão.');
          return;
        }
      }
      if (mPainel) {
        const r = opcoes.aoAplicar({ nivel, aparencia: rascunho.aparencia, marca: podeMarca() ? rascunho.marca : null });
        if (!r.ok) { erro('Você não tem permissão para mudar este nível.'); return; }
      }
      carregarNivel(nivel);
      const quem = { pessoal: 'para você', pasta: `para a ${esc(estado.nomeArea)}`, prefeitura: 'para todos' }[nivel];
      const oque = mPortal && mPainel ? `Aparência aplicada ${quem} e no Portal do Cidadão.` : mPortal ? 'Portal do Cidadão atualizado.' : `Aparência aplicada ${quem}.`;
      aviso = { texto: `<i class="ti ti-circle-check" aria-hidden="true"></i> ${oque}`, tipo: 'ok' };
      desenhar();
    }

    // O logo muda a amostra do cartão (e o botão "usar o original"): redesenha só o cartão da marca.
    function trocarLogo() {
      const cartao = el.querySelector('.pz-marca');
      cartao.outerHTML = desenharMarca(estado.usuario);
      ligar();
      sincronizar();
    }

    return {
      mostrar(e) {
        const trocouUsuario = !estado || !e.usuario || !estado.usuario || estado.usuario.id !== e.usuario.id;
        estado = e;
        if (trocouUsuario || !nivel || !niveis().includes(nivel)) { aviso = null; alvo = 'painel'; if (niveis().length) carregarNivel(niveis()[0]); }
        else if (!mudou()) carregarNivel(nivel);
        desenhar();
      },
    };
  };
})(window.GC = window.GC || {});
