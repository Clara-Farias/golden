(function (GC) {
  // Portal do Cidadão (cidadao.html). Uma página só, sem abas: a capa (manchete do dia, busca e mapa), o
  // bairro do morador, os serviços, os avisos, a época, os números e o atendimento. As rotas continuam valendo:
  // #/bairro, #/servicos, #/numeros e #/contatos rolam até a seção; #/mapa abre o mapa em tela cheia;
  // #/pedir e #/pedidos abrem a folha de pedidos. O voltar do navegador fecha o que abriu.
  // O conteúdo vem de GC.conteudoCidadao (js/tela-cidadao.js); o mapa, de GC.criarMapaCidadao.
  // O bairro do morador fica salvo neste aparelho. Avisos novos (inclusive comunicados publicados pelo
  // gabinete de crise em outra aba do painel) aparecem sozinhos.
  const $ = (id) => document.getElementById(id);
  const esc = (t) => GC.escaparHtml(t);
  const ic = (nome, classe) => `<i class="ti ti-${nome}${classe ? ` ${classe}` : ''}" aria-hidden="true"></i>`;
  // Rota → seção da página (rolagem) e título da janela.
  const SECOES = {
    inicio: { sec: 'sec-inicio', titulo: null },
    bairro: { sec: 'sec-bairro', titulo: 'Meu bairro' },
    servicos: { sec: 'sec-carta', titulo: 'Serviços' },
    avisos: { sec: 'sec-avisos', titulo: 'Avisos' },
    numeros: { sec: 'sec-numeros', titulo: 'A cidade em números' },
    contatos: { sec: 'sec-atendimento', titulo: 'Fale com a Prefeitura' },
    faq: { sec: 'faq', titulo: 'Perguntas frequentes' },
  };
  const CAMADAS = [
    { id: 'avisos', nome: 'Avisos', icone: 'alert-triangle' },
    { id: 'saude', nome: 'Hospitais e UPAs', icone: 'building-hospital' },
    { id: 'escolas', nome: 'Escolas', icone: 'school' },
    { id: 'obras', nome: 'Obras', icone: 'crane' },
    { id: 'pedidos', nome: 'Pedidos de moradores', icone: 'clipboard-list' },
  ];
  // Camada do conteúdo → camada do mapa do cidadão (coleta e ônibus não têm pino público).
  const CAMADA_MAPA = { risco: 'avisos', saude: 'saude', leitos: 'saude', escolas: 'escolas', obras: 'obras' };
  const PASSO_MS = 20000;
  const CIDADE = GC.cidade ? GC.cidade.id : 'media';
  const CHAVE_BAIRRO = `vd-meu-bairro.${CIDADE}`;
  const CHAVE_GABINETES = `gc.gabinetes.${CIDADE}`;
  const ler = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const gravar = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* modo privado: vale só nesta visita */ } };
  const mov = GC.movimentoPortal || null; // js/portal-movimento.js
  const nomeBairro = (id) => (GC.data.bairros.find((b) => b.id === id) || { nome: id }).nome;

  document.addEventListener('DOMContentLoaded', () => {
    // Grafismo do portal: curvas de nível brancas atrás da capa (fundo Titã).
    const hero = document.querySelector('.p-capa');
    if (hero && GC.grafismo) hero.insertAdjacentHTML('afterbegin', GC.grafismo.relevoTopo({ semente: 11, cor: '#ffffff', op: 0.16, w: 960, h: 260 }));
    const store = GC.criarStore(GC.data);
    let bairro = GC.data.bairros.some((b) => b.id === ler(CHAVE_BAIRRO)) ? ler(CHAVE_BAIRRO) : null;
    let busca = '';
    const numerosVistos = new Map(); // data-num → valor do último desenho ("número mudou")
    let idsNaLista = null; // avisos já na lista (o que chega depois entra com animação)
    let fimSaida = null;
    let modo = null; // null (página), 'mapa' (tela cheia) ou 'folha' (pedidos)
    let rolagemAntes = 0; // onde a pessoa estava na página antes de abrir o mapa ou a folha
    let mapa = null;
    let bairroNoMapa = null;
    // Começa só com o que pede atenção e com urgência (avisos, hospitais); escolas e obras, num toque.
    let camadasMapa = new Set(['avisos', 'saude']);
    let conteudo = null;
    let avisosVistos = null;
    // Pedidos do cidadão (js/portal-pedidos.js): formulário, meus pedidos e a camada do mapa.
    const pedidosUI = GC.criarPortalPedidos && GC.pedidos
      ? GC.criarPortalPedidos({ $, esc, ic, store, toast, irPara, bairroAtual: () => bairro, aoMudar: () => desenhar() }) : null;
    // Maia (botão flutuante): pedir um reparo e acompanhar pedidos pela conversa (js/portal-maia.js).
    if (GC.criarMaiaPortal && GC.pedidos) GC.criarMaiaPortal({ $, esc, ic, store, toast, bairroAtual: () => bairro, aoMudar: () => desenhar() });
    const pontosDoMapa = () => [...GC.pontosMapaCidadao(conteudo), ...(pedidosUI ? pedidosUI.pontosMapa() : [])];

    // Comunicados dos gabinetes de crise (salvos pelo painel do gestor neste navegador). O portal só lê.
    function comunicados() {
      if (!GC.criarGabinetes) return [];
      const g = GC.criarGabinetes({ armazenamento: { ler() { try { return JSON.parse(ler(CHAVE_GABINETES)); } catch (e) { return null; } }, gravar() {} } });
      const agora = GC.agora();
      const SEIS_H = 6 * 3600000;
      const dosGabinetes = g.todos().filter((x) => !x.encerradoEm || agora - x.encerradoEm < SEIS_H)
        .flatMap((x) => x.comunicados.map((c) => ({ t: c.t, texto: c.texto, titulo: `Comunicado da Prefeitura · ${x.titulo}`, bairroId: x.bairroId || null })));
      // Avisos que o prefeito publicou a partir de uma ocorrência (js/acoes-prefeito.js, "Avisar a população").
      const doPrefeito = GC.acoesPrefeito ? GC.acoesPrefeito.avisosPublicos().map((a) => ({ t: a.t, texto: a.texto, titulo: `Aviso da Prefeitura · ${a.titulo}`, bairroId: a.bairroId || null })) : [];
      return dosGabinetes.concat(doPrefeito);
    }
    const calcular = (b = bairro) => GC.conteudoCidadao({ ocorrencias: store.ocorrencias(), comunicados: comunicados(), bairro: b, busca, agora: GC.agora() });

    // ---------- cabeçalho e diálogos ----------
    const nomeCidade = (GC.cidade && GC.cidade.nome) || 'Vila Dourada';
    $('p-cidade').textContent = nomeCidade;
    $('p-cidade-rodape').textContent = nomeCidade;
    document.title = `${nomeCidade} · Prefeitura`;
    // Aparência, logo, nome e assinatura definidos pelo gestor geral (js/personalizacao.js).
    if (GC.personalizacao) GC.personalizacao.aplicarPortal();
    const tel = () => GC.telefonePrefeitura();
    const telHref = () => tel().replace(/[^\d+]/g, '');

    const ordenados = GC.data.bairros.slice().sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    function abrirEscolhaBairro() {
      const sel = $('p-sel-bairro');
      sel.innerHTML = `<option value="">Escolha…</option>${ordenados.map((b) => `<option value="${b.id}">${esc(b.nome)}</option>`).join('')}`;
      sel.value = bairro || '';
      $('p-geo-msg').textContent = '';
      $('p-dlg-bairro').showModal();
    }
    $('p-dlg-bairro').addEventListener('close', () => {
      const d = $('p-dlg-bairro');
      if (d.returnValue === 'ok' && $('p-sel-bairro').value) definirBairro($('p-sel-bairro').value);
    });
    function definirBairro(id) {
      bairro = id;
      gravar(CHAVE_BAIRRO, id);
      desenhar();
    }
    $('p-meu-bairro').onclick = abrirEscolhaBairro;

    // Demonstração: trocar de perfil (vai para o painel do gestor) ou de cidade.
    $('p-demo').onclick = () => {
      const perfis = GC.PERFIS || [];
      const p = (id) => perfis.find((x) => x.id === id) || { nome: id };
      $('p-sel-perfil').innerHTML = `<option value="cidadao">Cidadão (este portal)</option>
        <option value="prefeito">${esc(p('prefeito').nome)} (Prefeito)</option>
        <optgroup label="Gestor do setor">${GC.data.areas.map((a) => `<option value="setor:${a.id}">${esc(a.secretaria.nome)}</option>`).join('')}</optgroup>
        <optgroup label="Servidor (portal do servidor)">${GC.data.areas.map((a) => `<option value="servidor:${a.id}">${esc(a.secretaria.nome)}</option>`).join('')}</optgroup>`;
      const hab = (n) => (n >= 1e6 ? `${(n / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi hab.` : `${Math.round(n / 1000)} mil hab.`);
      $('p-sel-cidade').innerHTML = (GC.CIDADES || []).map((c) => `<option value="${c.id}">${esc(`${c.nome} · ${hab(c.populacao)}`)}</option>`).join('');
      $('p-sel-cidade').value = CIDADE;
      $('p-dlg-demo').showModal();
    };
    $('p-dlg-demo').addEventListener('close', () => {
      if ($('p-dlg-demo').returnValue !== 'ok') return;
      const [id, area] = $('p-sel-perfil').value.split(':');
      if (id !== 'cidadao') { GC.escolherPerfil(id, area); return; }
      if ($('p-sel-cidade').value !== CIDADE) GC.escolherCidade($('p-sel-cidade').value);
    });

    // ---------- pedaços de HTML ----------
    const nivel = (n) => `<span class="p-nivel ${n}">${ic(n === 'urgente' ? 'alert-octagon' : n === 'atencao' ? 'alert-triangle' : 'info-circle')}${esc(GC.NIVEIS_AVISO[n])}</span>`;
    const temNoMapa = (camada) => camada && CAMADA_MAPA[camada[0]];
    const botaoMapa = (camada, bairroId, rotulo = 'Ver no mapa') => (temNoMapa(camada) || bairroId
      ? `<button type="button" class="p-btn p-btn-sec p-btn-mini" data-mapa="${esc(camada ? camada[0] : '')}" data-id="${esc(camada && camada[1] ? camada[1] : '')}" data-bairro="${esc(bairroId || '')}">${ic('map-2')} ${esc(rotulo)}</button>` : '');

    function htmlAviso(a) {
      const pinos = (a.pontos || []).filter((p) => p.lat !== undefined);
      return `<li class="p-aviso ${a.nivel} ${a.tipo}" data-aviso-id="${esc(a.id)}">
        <div class="p-aviso-cab">${nivel(a.nivel)}${a.tipo === 'comunicado' ? `<span class="p-tag">${ic('speakerphone')} Comunicado oficial</span>` : ''}${a.doMeuBairro && a.tipo !== 'comunicado' ? `<span class="p-tag p-tag-bairro">${ic('map-pin')} Seu bairro</span>` : ''}${a.quando !== null && a.quando !== undefined ? `<span class="p-quando">${esc(GC.haQuanto(a.quando))}</span>` : ''}</div>
        <h3>${esc(a.titulo)}</h3>
        <p>${esc(a.texto)}</p>
        ${a.locais && a.locais.length ? `<ul class="p-locais">${a.locais.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>` : ''}
        <div class="p-aviso-acoes">
          ${pinos.length ? `<button type="button" class="p-btn p-btn-sec p-btn-mini" data-aviso="${esc(a.id)}">${ic('map-2')} Ver no mapa</button>` : ''}
          <button type="button" class="p-btn p-btn-sec p-btn-mini" data-compartilhar="${esc(a.id)}" aria-label="Compartilhar o aviso: ${esc(a.titulo)}">${ic('share')} Compartilhar</button>
        </div>
      </li>`;
    }

    // Versão curta para a Início: nível, título e há quanto tempo; o resto abre num toque.
    const ICONE_NIVEL = { urgente: 'alert-octagon', atencao: 'alert-triangle', informativo: 'info-circle' };
    function htmlAvisoCompacto(a) {
      const pinos = (a.pontos || []).filter((p) => p.lat !== undefined);
      return `<li class="p-aviso-c ${a.nivel} ${a.tipo}" data-aviso-id="${esc(a.id)}">
        <details data-pergunta="aviso:${esc(a.id)}">
          <summary>
            <span class="p-aviso-c-ic" aria-hidden="true">${ic(a.tipo === 'comunicado' ? 'speakerphone' : ICONE_NIVEL[a.nivel] || 'info-circle')}</span>
            <span class="p-aviso-c-txt">
              <span class="p-aviso-cab">${nivel(a.nivel)}${a.tipo === 'comunicado' ? `<span class="p-tag">${ic('speakerphone')} Comunicado oficial</span>` : ''}${a.doMeuBairro && a.tipo !== 'comunicado' ? `<span class="p-tag p-tag-bairro">${ic('map-pin')} Seu bairro</span>` : ''}${a.quando !== null && a.quando !== undefined ? `<span class="p-quando">${esc(GC.haQuanto(a.quando))}</span>` : ''}</span>
              <b class="p-aviso-c-tit">${esc(a.titulo)}</b>
            </span>
            ${ic('chevron-down', 'p-faq-seta')}
          </summary>
          <div class="p-aviso-c-corpo">
            <p>${esc(a.texto)}</p>
            ${a.locais && a.locais.length ? `<ul class="p-locais">${a.locais.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>` : ''}
            <div class="p-aviso-acoes">
              ${pinos.length ? `<button type="button" class="p-btn p-btn-sec p-btn-mini" data-aviso="${esc(a.id)}">${ic('map-2')} Ver no mapa</button>` : ''}
              <button type="button" class="p-btn p-btn-sec p-btn-mini" data-compartilhar="${esc(a.id)}" aria-label="Compartilhar o aviso: ${esc(a.titulo)}">${ic('share')} Compartilhar</button>
            </div>
          </div>
        </details>
      </li>`;
    }
    // Cabeçalho de seção: rótulo em versalete, título em Sora e, à direita, um extra (contagem, link).
    const cabSecao = (id, rotulo, titulo, extra = '') => `<header class="p-secao-cab"><div><p class="p-rotulo">${esc(rotulo)}</p><h2 id="${id}">${esc(titulo)}</h2></div>${extra}</header>`;

    // ---------- capa: a manchete do dia ----------
    // A manchete é o aviso mais grave (comunicado oficial e o do bairro do morador primeiro, no mesmo nível).
    // Sem aviso de urgência ou atenção, a capa é a saudação.
    const PESO_NIVEL = { urgente: 0, atencao: 1, informativo: 2 };
    function manchete(c) {
      const peso = (a) => (PESO_NIVEL[a.nivel] ?? 3) * 4 + (a.tipo === 'comunicado' ? 0 : 1) * 2 + (a.doMeuBairro ? 0 : 1);
      const m = c.avisos.slice().sort((a, b) => peso(a) - peso(b))[0];
      return m && m.nivel !== 'informativo' ? m : null;
    }
    let mancheteAntes; // undefined: ainda não desenhou
    function desenharCapa(c, saudacao) {
      const m = manchete(c);
      const chave = m ? m.id : null;
      if (mov && mancheteAntes !== undefined && chave !== mancheteAntes) mov.pulsoDeClasse(document.querySelector('.p-capa-texto'), 'p-troca', 700);
      // Tudo calmo: as curvas de nível da capa se desenham (ao abrir calmo ou quando o último aviso sai).
      if (mov && !m && mancheteAntes !== null) mov.desenharCurvas(document.querySelector('.p-capa > .ga-relevo'));
      mancheteAntes = chave;
      const meu = c.meuBairro;
      const capa = $('sec-inicio');
      capa.classList.toggle('urgente', !!m && m.nivel === 'urgente');
      capa.classList.toggle('atencao', !!m && m.nivel === 'atencao');
      if (m) {
        $('t-inicio').textContent = m.titulo;
        $('p-inicio-sub').textContent = m.texto;
        trocarHtml($('p-capa-nivel'), `${nivel(m.nivel)}${m.tipo === 'comunicado' ? `<span class="p-tag">${ic('speakerphone')} Comunicado oficial</span>` : ''}${m.doMeuBairro && meu.escolhido && m.tipo !== 'comunicado' ? `<span class="p-tag p-tag-bairro">${ic('map-pin')} Seu bairro</span>` : ''}${m.quando !== null && m.quando !== undefined ? `<span class="p-quando">${esc(GC.haQuanto(m.quando))}</span>` : ''}`);
        const pinos = (m.pontos || []).some((p) => p.lat !== undefined);
        const outros = c.avisos.length - 1;
        trocarHtml($('p-capa-acoes'), `${pinos ? `<button type="button" class="p-btn" data-aviso="${esc(m.id)}">${ic('map-2')} Ver no mapa</button>` : ''}
          <button type="button" class="p-btn p-btn-claro" data-compartilhar="${esc(m.id)}" aria-label="Compartilhar o aviso: ${esc(m.titulo)}">${ic('share')} Compartilhar</button>
          ${outros > 0 ? `<a class="p-link p-link-claro" href="#/avisos">Mais ${outros} ${outros > 1 ? 'avisos' : 'aviso'} ${ic('arrow-down')}</a>` : ''}`);
      } else {
        $('t-inicio').textContent = `${saudacao}!`;
        $('p-inicio-sub').textContent = meu.escolhido
          ? `Nenhum aviso de atenção em ${c.cidade} agora. Veja abaixo o dia em ${meu.nome}.`
          : `Nenhum aviso de atenção em ${c.cidade} agora. Escolha o seu bairro para ver a coleta, o posto de saúde e as escolas perto de você.`;
        trocarHtml($('p-capa-nivel'), '');
        trocarHtml($('p-capa-acoes'), meu.escolhido ? '' : `<button type="button" class="p-btn" data-trocar-bairro>${ic('map-pin')} Escolher meu bairro</button>`);
      }
      const perigo = c.avisos.some((a) => a.nivel === 'urgente');
      $('p-emergencia').hidden = !perigo;
      $('p-emergencia').innerHTML = perigo ? `${ic('phone-call')}<span><b>Em perigo?</b> <a href="tel:199">199</a> Defesa Civil · <a href="tel:193">193</a> Bombeiros · <a href="tel:192">192</a> SAMU</span>` : '';
    }

    // ---------- seu bairro: o "cartão-postal" ----------
    // Silhueta do bairro desenhada do próprio polígono (o mesmo do mapa).
    function silhueta(bd) {
      if (!bd || !bd.poligono || bd.poligono.length < 3) return '';
      const k = Math.cos((bd.poligono[0][0] * Math.PI) / 180);
      const pts = bd.poligono.map(([lat, lng]) => [lng * k, -lat]);
      const xs = pts.map((p) => p[0]); const ys = pts.map((p) => p[1]);
      const x0 = Math.min(...xs); const y0 = Math.min(...ys);
      const lado = Math.max(Math.max(...xs) - x0, Math.max(...ys) - y0) || 1;
      const d = pts.map((p, i) => `${i ? 'L' : 'M'}${(((p[0] - x0) / lado) * 80 + 10).toFixed(1)} ${(((p[1] - y0) / lado) * 80 + 10).toFixed(1)}`).join(' ');
      return `<svg class="p-silhueta" viewBox="0 0 100 100" aria-hidden="true" focusable="false"><path d="${d} Z" pathLength="1"/></svg>`;
    }
    const ROTULO_HOJE = { speakerphone: 'Avisos', 'circle-check': 'Avisos' };
    function htmlHoje(h) {
      const k = h.texto.indexOf(': ');
      const rot = k > 0 ? h.texto.slice(0, k) : (ROTULO_HOJE[h.icone] || '');
      const valor = k > 0 ? h.texto.slice(k + 2) : h.texto;
      const corpo = `<span class="p-hoje-rot">${ic(h.icone)} ${esc(rot)}</span><b data-num="hoje-${esc(h.icone)}">${esc(valor)}</b>`;
      return `<li class="${h.nivel || ''}">${h.alvo === 'avisos' ? `<a href="#/avisos">${corpo}</a>` : corpo}</li>`;
    }
    function htmlBairro(c) {
      const meu = c.meuBairro;
      const bd = GC.data.bairros.find((b) => b.id === meu.id);
      const relevo = GC.grafismo ? GC.grafismo.relevoTopo({ semente: GC.grafismo.semente(meu.escolhido ? meu.id : 'portal'), coord: meu.escolhido && bd && bd.centro ? `${meu.nome.toUpperCase()} · ${GC.grafismo.coord(bd.centro)}` : null }) : '';
      if (!meu.escolhido) {
        return `<div class="p-postal p-postal-vazio">${relevo}
          <div class="p-postal-cab"><div><p class="p-rotulo">Seu bairro</p><h2 id="t-bairro">Qual é o seu bairro?</h2></div></div>
          <p class="p-postal-txt">Escolha o seu bairro e esta página passa a mostrar primeiro o que acontece perto de você: avisos, coleta de lixo, posto de saúde e escolas.</p>
          <button type="button" class="p-btn" data-trocar-bairro>${ic('map-pin')} Escolher meu bairro</button>
        </div>`;
      }
      return `<div class="p-postal">${relevo}
          <div class="p-postal-cab">${silhueta(bd)}<div><p class="p-rotulo">Seu bairro hoje</p><h2 id="t-bairro">${esc(meu.nome)}</h2></div>
            <button type="button" class="p-link" data-trocar-bairro>Trocar</button></div>
          <ul class="p-hoje">${c.hoje.map(htmlHoje).join('')}</ul>
        </div>
        <details class="p-bairro-mais" data-pergunta="bairro-mais">
          <summary>${ic('list-details')} Tudo sobre ${esc(meu.nome)}: coleta, saúde, escolas e obras ${ic('chevron-down', 'p-faq-seta')}</summary>
          ${htmlItensBairro(meu)}
          ${botaoMapa(null, meu.id, `Ver ${meu.nome} no mapa`)}
        </details>`;
    }

    // ---------- pedir um reparo ----------
    function htmlServicos() {
      const tipos = GC.TIPOS_PEDIDO || [];
      const meus = GC.pedidos ? GC.pedidos.meus().length : 0;
      const extra = meus ? `<a class="p-link" href="#/pedidos">Meus pedidos (${meus}) ${ic('arrow-right')}</a>` : '';
      if (!pedidosUI || !tipos.length) {
        return `${cabSecao('t-servicos', 'Serviços', 'Pedir um reparo')}
          <p class="p-secao-sub">Ligue <a href="tel:${esc(telHref())}"><b>${esc(tel())}</b></a>. Diga o endereço e um ponto de referência; você recebe um número de protocolo para acompanhar o pedido.</p>`;
      }
      return `${cabSecao('t-servicos', 'O que você precisa resolver?', 'Pedir um reparo', extra)}
        <p class="p-secao-sub">Marque o lugar no mapa, mande uma foto se puder e receba um protocolo para acompanhar.</p>
        <ul class="p-servicos">${tipos.map((t) => `<li><a class="p-servico" href="#/pedir/${esc(t.id)}"><span class="p-servico-ic">${ic(t.icone)}</span><span>${esc(t.nome)}</span>${ic('arrow-right', 'p-servico-seta')}</a></li>`).join('')}</ul>
        <p class="p-servicos-pe">${meus ? '' : `<a class="p-link" href="#/pedidos">${ic('search')} Acompanhar pelo protocolo</a> <span aria-hidden="true">·</span> `}Prefere ligar? <a href="tel:${esc(telHref())}"><b>${esc(tel())}</b></a></p>`;
    }

    // ---------- avisos ----------
    function htmlAvisos(c) {
      const urgentes = c.avisos.filter((a) => a.nivel === 'urgente').length;
      const contagem = c.avisos.length ? `<span class="p-contagem">${urgentes ? `<span class="p-contagem-urg">${urgentes} ${urgentes > 1 ? 'urgentes' : 'urgente'}</span> · ` : ''}${c.avisos.length} no total</span>` : '';
      return `${cabSecao('t-avisos', 'Avisos da Prefeitura', c.avisos.length ? 'O que está acontecendo' : 'Tudo calmo agora', contagem)}
        ${c.avisos.length ? `<ul class="p-avisos-c">${c.avisos.map(htmlAvisoCompacto).join('')}</ul>` : `<p class="p-vazio">${ic('circle-check')} Nenhum aviso agora.</p>`}`;
    }

    // "Fique atento neste mês": as épocas em curso e as que estão chegando, com a dica ao morador (js/data-sazonal.js).
    function htmlEpoca(lista) {
      if (!lista || !lista.length) return '';
      return `${cabSecao('t-epoca', 'Fique atento', 'Nesta época do ano')}
          <ul class="p-epoca-lista">${lista.map((e) => `<li class="${e.agora ? 'agora' : ''}"><span class="p-item-ic">${ic(e.icone)}</span>
            <div><h3>${esc(e.nome)} <small>${esc(e.quando)}</small></h3><p>${esc(e.dica)}</p></div></li>`).join('')}</ul>`;
    }

    function htmlItensBairro(meu) {
      return `<ul class="p-itens">${meu.itens.map((i) => `<li class="p-item${i.nivel ? ` ${i.nivel}` : ''}">
        <span class="p-item-ic">${ic(i.icone)}</span>
        <div><h3>${esc(i.titulo)}</h3>${i.destaque ? `<p class="p-destaque">${esc(i.destaque)}</p>` : ''}
          <ul class="p-linhas">${(i.linhas || [i.texto]).map((l) => `<li>${esc(l)}</li>`).join('')}</ul>
          ${botaoMapa(temNoMapa(i.camada) ? i.camada : null, meu.id)}</div></li>`).join('')}</ul>`;
    }

    function htmlFaq(c) {
      return c.faq.length ? c.faq.map((f, k) => `<details class="p-faq" data-pergunta="${esc(f.pergunta)}"${k === 0 && busca ? ' open' : ''}>
          <summary><small>${esc(f.tema)}</small><span>${esc(f.pergunta)}</span>${ic('chevron-down', 'p-faq-seta')}</summary>
          <p>${esc(f.resposta)}</p>${f.alvo === 'bairro' ? `<a class="p-link" href="#/bairro">Ver o meu bairro ${ic('arrow-right')}</a>` : botaoMapa(temNoMapa(f.camada) ? f.camada : null, null)}</details>`).join('')
        : `<p class="p-vazio">Nenhuma pergunta com esse termo. Ligue <a href="tel:${esc(telHref())}">${esc(tel())}</a> que a Prefeitura responde.</p>`;
    }

    // Outros canais do atendimento (WhatsApp e ouvidoria), quando a Prefeitura informou.
    function htmlCanais() {
      const a = GC.atendimentoPortal ? GC.atendimentoPortal() : {};
      const canais = [];
      if (a.whatsapp) canais.push(`<a class="p-canal" href="${esc(GC.linkWhatsapp(a.whatsapp))}" target="_blank" rel="noopener">${ic('brand-whatsapp')} WhatsApp ${esc(a.whatsapp)}</a>`);
      if (a.email) canais.push(`<a class="p-canal" href="mailto:${esc(a.email)}">${ic('mail')} Ouvidoria: ${esc(a.email)}</a>`);
      return canais.length ? `<p class="p-canais">Também por ${canais.join('')}</p>` : '';
    }

    // ---------- atendimento: telefones e perguntas (faixa escura no fim da página) ----------
    function htmlAtendimento(c) {
      return `<div class="p-atendimento-in">
        ${cabSecao('t-atendimento', 'Atendimento', 'Fale com a Prefeitura')}
        ${htmlCanais()}
        <ul class="p-contatos" id="contatos" aria-label="Telefones úteis">${c.contatos.map((t) => `<li><a class="p-contato" href="tel:${esc(String(t.numero).replace(/[^\d+]/g, ''))}" aria-label="Ligar ${t.numero}, ${esc(t.nome)}"><b>${t.numero}</b><span><strong>${ic(t.icone)} ${esc(t.nome)}</strong><small>${esc(t.texto)}</small></span></a></li>`).join('')}</ul>
        <div class="p-faq-bloco" id="faq" aria-labelledby="t-faq">
          <h3 id="t-faq">Perguntas frequentes</h3>
          <label class="p-busca">${ic('search')}<span class="p-so-leitor">Buscar nas perguntas frequentes</span><input type="search" id="p-busca" placeholder="Busque: lixo, creche, ônibus, chuva…" value="${esc(busca)}" autocomplete="off"></label>
          <div id="p-faqs" class="p-faqs">${htmlFaq(c)}</div>
        </div>
      </div>`;
    }

    const SIT = { ok: 'Na meta', atencao: 'Perto da meta', critico: 'Fora da meta', sem_dado: 'Sem dado' };
    function htmlNumeros() {
      const lista = GC.avaliarIndicadores(GC.contextoIndicadores(store, {}), { publico: true });
      const nomeArea = (id) => (id ? (GC.data.areas.find((a) => a.id === id) || { nome: id }).nome : 'Prefeitura');
      const grupos = [...new Set(lista.map((i) => i.area || ''))];
      const conta = (s) => lista.filter((i) => i.situacao === s).length;
      const placar = ['ok', 'atencao', 'critico'].map((s) => `<li class="${s}"><b data-num="placar-${s}" data-v="${conta(s)}">${conta(s)}</b><span>${SIT[s].toLowerCase()}</span></li>`).join('');
      const barra = ['ok', 'atencao', 'critico'].filter((s) => conta(s)).map((s) => `<span class="${s}" style="flex-grow:${conta(s)}"></span>`).join('');
      const fmt = (v, u) => (v === null || v === undefined ? 'sem dado' : GC.formatarIndicador(v, u));
      // Régua até a meta: a barra é o valor de hoje, o traço é a meta (a cor e o texto dizem se está bem).
      const medidor = (i) => {
        const v = Number(i.valorAtual);
        const m = Number(i.metaAtual);
        if (i.valorAtual === null || i.valorAtual === undefined || !Number.isFinite(v) || !Number.isFinite(m) || Math.max(v, m) <= 0) return '';
        const max = Math.max(v, m) * 1.15;
        const pct = (x) => Math.max(0, Math.min(100, (x / max) * 100)).toFixed(1);
        return `<span class="p-medidor ${i.situacao}" aria-hidden="true"><span class="p-medidor-v" style="width:${pct(v)}%"></span><span class="p-medidor-meta" style="left:${pct(m)}%"></span></span>`;
      };
      const ICONE_AREA = { saude: 'heartbeat', educacao: 'school', seguranca: 'shield-check', defesa_civil: 'umbrella', infraestrutura: 'crane', mobilidade: 'bus', limpeza: 'recycle' };
      return `${cabSecao('t-numeros', 'A cidade em números', `Como ${(GC.cidade && GC.cidade.nome) || 'a cidade'} está nas metas`)}
        <p class="p-secao-sub">Os números são atualizados conforme cada área informa.</p>
        <div class="p-placar-caixa" aria-label="Resumo das metas">
          <ul class="p-placar">${placar}</ul>
          <div class="p-placar-barra" aria-hidden="true">${barra}</div>
        </div>
        <details class="p-numeros-todos" data-pergunta="numeros-todos">
          <summary>${ic('chart-bar')} Ver os ${lista.length} indicadores, área por área ${ic('chevron-down', 'p-faq-seta')}</summary>
          ${grupos.map((g) => `<div class="p-ind-grupo"><h3 class="p-ind-area" id="t-ind-${esc(g || 'geral')}"><span class="p-area-ic ${esc(g || 'geral')}" aria-hidden="true">${ic(ICONE_AREA[g] || 'building-bank')}</span> ${esc(nomeArea(g))}</h3>
          <ul class="p-indicadores" aria-labelledby="t-ind-${esc(g || 'geral')}">${lista.filter((i) => (i.area || '') === g).map((i) => `<li>
            <details class="p-ind ${i.situacao}" data-pergunta="${esc(i.id)}">
              <summary>
                <div class="p-ind-nome"><h4>${esc(i.nome)}</h4>${i.detalheAtual ? `<p>${esc(i.detalheAtual)}</p>` : ''}</div>
                <div class="p-ind-valor"><b>${esc(fmt(i.valorAtual, i.unidade))}</b><small>meta ${i.polaridade === 'menor' ? 'até' : 'de pelo menos'} ${esc(fmt(i.metaAtual, i.unidade))}</small><span class="p-sit ${i.situacao}">${esc(SIT[i.situacao] || '')}</span></div>
                ${medidor(i)}
                <span class="p-ind-mais">${ic('chevron-down', 'p-faq-seta')} Como é medido</span>
              </summary>
              <dl class="p-ind-ficha">
                ${i.formula ? `<dt>Como é calculado</dt><dd>${esc(i.formula)}</dd>` : ''}
                ${i.fonte ? `<dt>De onde vem o dado</dt><dd>${esc(i.fonte)}</dd>` : ''}
                ${i.frequenciaAtual ? `<dt>Atualização</dt><dd>${esc(i.frequenciaAtual)}</dd>` : ''}
                <dt>Meta</dt><dd>${i.polaridade === 'menor' ? 'Quanto menor, melhor: até' : 'Quanto maior, melhor: pelo menos'} ${esc(fmt(i.metaAtual, i.unidade))}.</dd>
              </dl>
            </details>
          </li>`).join('')}</ul></div>`).join('')}
        </details>`;
    }

    // ---------- mapa ----------
    $('p-camadas').innerHTML = CAMADAS.map((c) => `<button type="button" class="p-camada" data-camada="${c.id}" aria-pressed="${camadasMapa.has(c.id)}">${ic(c.icone)} ${esc(c.nome)}</button>`).join('');
    $('p-camadas').querySelectorAll('[data-camada]').forEach((b) => {
      b.onclick = () => {
        const id = b.dataset.camada;
        if (camadasMapa.has(id)) camadasMapa.delete(id); else camadasMapa.add(id);
        b.setAttribute('aria-pressed', String(camadasMapa.has(id)));
        if (mapa) mapa.camadas(camadasMapa);
      };
    });
    function garantirMapa() {
      if (mapa !== null) return mapa;
      const risco = GC.risco ? GC.risco.resumo(store.ocorrencias()).areas : [];
      mapa = GC.criarMapaCidadao($('p-mapa'), { aoBairro: mostrarBairroNoMapa, areasRisco: risco }) || false;
      if (mapa) {
        mapa.pontos(pontosDoMapa());
        mapa.camadas(camadasMapa);
      }
      return mapa;
    }
    // Clique num bairro: o resumo do bairro na versão do cidadão (nunca o painel do gestor).
    function mostrarBairroNoMapa(id) {
      bairroNoMapa = id;
      // Na capa, o mapa é pequeno: o bairro abre com o mapa em tela cheia, com o resumo ao lado.
      if (modo !== 'mapa') irPara('mapa');
      if (mapa) mapa.selecionarBairro(id, { voar: false });
      desenharBairroNoMapa();
    }
    function desenharBairroNoMapa() {
      const el = $('p-mapa-bairro');
      if (!bairroNoMapa) { el.innerHTML = ''; return; }
      const c = calcular(bairroNoMapa);
      const avisos = c.avisos.filter((a) => a.doMeuBairro && a.tipo !== 'comunicado');
      el.innerHTML = `<section class="p-card" aria-labelledby="t-bairro-mapa">
        <div class="p-card-cab"><h2 id="t-bairro-mapa">${ic('map-pin')} ${esc(c.meuBairro.nome)}</h2>
          <button type="button" class="p-x" data-fechar-bairro aria-label="Fechar o bairro">${ic('x')}</button></div>
        ${avisos.length ? `<ul class="p-avisos">${avisos.map(htmlAviso).join('')}</ul>` : `<p class="p-vazio">${ic('circle-check')} Nenhum aviso neste bairro agora.</p>`}
        ${htmlItensBairro(c.meuBairro).replace(/<button[^>]*data-mapa[^>]*>[\s\S]*?<\/button>/g, '')}
        ${bairro === bairroNoMapa ? '' : `<button type="button" class="p-btn p-btn-sec" data-tornar-meu="${esc(bairroNoMapa)}">${ic('home')} Este é o meu bairro</button>`}
      </section>`;
      ligar(el);
      const x = el.querySelector('[data-fechar-bairro]');
      if (x) x.onclick = () => { bairroNoMapa = null; if (mapa) mapa.selecionarBairro(null, { voar: false }); desenharBairroNoMapa(); };
      const t = el.querySelector('[data-tornar-meu]');
      if (t) t.onclick = () => definirBairro(t.dataset.tornarMeu);
    }
    function verNoMapa({ camada, id, bairroId, aviso }) {
      irPara('mapa');
      setTimeout(() => {
        const m = garantirMapa();
        if (!m) return;
        m.redimensionar();
        if (aviso) {
          const a = conteudo.avisos.find((x) => x.id === aviso);
          const p = a && (a.pontos || []).find((x) => x.lat !== undefined);
          if (!camadasMapa.has('avisos')) $('p-camadas').querySelector('[data-camada="avisos"]').click();
          if (!m.focar('avisos', aviso) && p) m.focarPonto(p.lat, p.lng);
          return;
        }
        const alvo = CAMADA_MAPA[camada];
        if (alvo && !camadasMapa.has(alvo)) $('p-camadas').querySelector(`[data-camada="${alvo}"]`).click();
        const achou = alvo && alvo !== 'avisos' && m.focar(alvo, id);
        if (!achou && bairroId) { m.selecionarBairro(bairroId); mostrarBairroNoMapa(bairroId); }
      }, 60);
    }

    // ---------- desenho ----------
    function ligar(raiz) {
      raiz.querySelectorAll('[data-trocar-bairro]').forEach((b) => { b.onclick = abrirEscolhaBairro; });
      raiz.querySelectorAll('[data-aviso]').forEach((b) => { b.onclick = () => verNoMapa({ aviso: b.dataset.aviso }); });
      raiz.querySelectorAll('[data-mapa]').forEach((b) => { b.onclick = () => verNoMapa({ camada: b.dataset.mapa, id: b.dataset.id || null, bairroId: b.dataset.bairro || null }); });
      raiz.querySelectorAll('[data-compartilhar]').forEach((b) => { b.onclick = () => compartilhar(b.dataset.compartilhar); });
      raiz.querySelectorAll('[data-foco]').forEach((a) => { a.onclick = () => { setTimeout(() => { const f = $(a.dataset.foco); if (f) { f.scrollIntoView({ behavior: 'smooth', block: 'start' }); destacar(f); } }, 80); }; });
    }

    // Redesenha uma aba só quando o HTML muda, e devolve o foco e as perguntas abertas: quem está lendo
    // ou navegando pelo teclado não perde o lugar a cada atualização.
    const ultimo = {};
    function trocarHtml(el, html) {
      if (ultimo[el.id] === html) return;
      ultimo[el.id] = html;
      const ativo = document.activeElement && el.contains(document.activeElement) ? document.activeElement : null;
      const chaveFoco = ativo && (ativo.id ? `#${CSS.escape(ativo.id)}`
        : ['aviso', 'compartilhar'].filter((k) => ativo.dataset[k]).map((k) => `[data-${k}="${CSS.escape(ativo.dataset[k])}"]`)[0] || null);
      const abertas = [...el.querySelectorAll('details[open]')].map((d) => d.dataset.pergunta);
      el.innerHTML = html;
      abertas.forEach((p) => { const d = [...el.querySelectorAll('details')].find((x) => x.dataset.pergunta === p); if (d) d.open = true; });
      ligar(el);
      if (chaveFoco) {
        const novo = el.querySelector(chaveFoco);
        if (novo) novo.focus();
      }
    }

    function desenhar() {
      conteudo = calcular();
      const meu = conteudo.meuBairro;
      $('p-meu-bairro-nome').textContent = meu.escolhido ? meu.nome : 'Escolha seu bairro';
      $('p-meu-bairro').setAttribute('aria-label', meu.escolhido ? `Seu bairro: ${meu.nome}. Trocar` : 'Escolher o seu bairro');
      const agora = new Date(GC.agora());
      const h = agora.getHours();
      const saudacao = h < 5 ? 'Boa noite' : h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
      const data = agora.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
      $('p-hero-data').textContent = `${data.charAt(0).toUpperCase() + data.slice(1)} · ${saudacao}`;
      desenharCapa(conteudo, saudacao);
      if ($('p-busca-geral').value) mostrarResultados();
      trocarHtml($('sec-bairro'), htmlBairro(conteudo));
      trocarHtml($('sec-meus-pedidos'), pedidosUI ? pedidosUI.htmlInicio() : '');
      trocarHtml($('sec-servicos'), htmlServicos());
      trocarHtml($('sec-avisos'), htmlAvisos(conteudo));
      if (mov) {
        mov.marcarMudancas($('sec-bairro'), numerosVistos);
        idsNaLista = mov.marcarNovos($('sec-avisos'), '[data-aviso-id]', 'data-aviso-id', idsNaLista);
      }
      const epoca = htmlEpoca(conteudo.epoca);
      $('sec-epoca').hidden = !epoca;
      trocarHtml($('sec-epoca'), epoca);
      trocarHtml($('sec-numeros'), htmlNumeros());
      if (mov) mov.marcarMudancas($('sec-numeros'), numerosVistos);
      if (!$('p-busca') || document.activeElement !== $('p-busca')) trocarHtml($('sec-atendimento'), htmlAtendimento(conteudo));
      ligarBusca();
      if (mapa) mapa.pontos(pontosDoMapa());
      if (bairroNoMapa) desenharBairroNoMapa();
      anunciarNovos();
    }
    function ligarBusca() {
      const b = $('p-busca');
      if (!b || b.dataset.ligado) return;
      b.dataset.ligado = '1';
      b.oninput = () => {
        busca = b.value;
        $('p-faqs').innerHTML = htmlFaq(calcular());
        ligar($('p-faqs'));
      };
    }
    // ---------- busca única (Início) ----------
    function mostrarResultados() {
      const termo = $('p-busca-geral').value;
      const lista = GC.buscaCidadao(conteudo, termo);
      const ul = $('p-resultados');
      const curto = termo.trim().length < 2;
      ul.hidden = curto;
      $('p-res-info').textContent = curto ? '' : lista.length ? `${lista.length} resultado${lista.length > 1 ? 's' : ''}` : 'Nada encontrado';
      if (curto) { ul.innerHTML = ''; return; }
      ul.innerHTML = lista.length ? lista.map((r, k) => {
        const corpo = `${ic(r.icone)}<span><b>${esc(r.titulo)}</b><small>${esc(r.detalhe)}</small></span>${ic(r.tipo === 'servico' || r.tipo === 'contato' ? 'phone' : 'chevron-right')}`;
        return `<li>${r.tipo === 'servico' || r.tipo === 'contato'
          ? `<a class="p-resultado" href="tel:${esc(String(r.alvo).replace(/[^\d+]/g, ''))}">${corpo}</a>`
          : `<button type="button" class="p-resultado" data-resultado="${k}">${corpo}</button>`}</li>`;
      }).join('')
        : `<li class="p-vazio-busca">Nada encontrado para "${esc(termo)}". Ligue <a href="tel:${esc(telHref())}">${esc(tel())}</a> que a Prefeitura ajuda.</li>`;
      ul.querySelectorAll('[data-resultado]').forEach((b) => { b.onclick = () => abrirResultado(lista[Number(b.dataset.resultado)]); });
    }
    function abrirResultado(r) {
      if (r.tipo === 'bairro') { verNoMapa({ bairroId: r.alvo }); return; }
      if (r.tipo === 'aviso') {
        const li = $('sec-avisos').querySelector(`[data-aviso-id="${CSS.escape(r.alvo)}"]`);
        if (li) {
          const d = li.querySelector('details');
          if (d) d.open = true;
          li.scrollIntoView({ behavior: 'smooth', block: 'center' }); destacar(li);
        }
        return;
      }
      if (r.tipo === 'pergunta') {
        irPara('faq');
        setTimeout(() => {
          const d = [...$('sec-atendimento').querySelectorAll('details')].find((x) => x.dataset.pergunta === r.alvo);
          if (d) { d.open = true; d.scrollIntoView({ behavior: 'smooth', block: 'center' }); d.querySelector('summary').focus({ preventScroll: true }); destacar(d); }
        }, 60);
      }
    }
    const destacar = (el) => { if (mov) mov.alvo(el); };
    $('p-busca-geral').addEventListener('input', mostrarResultados);
    $('p-busca-geral').addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.target.value = ''; mostrarResultados(); } });

    // ---------- compartilhar um aviso (WhatsApp, SMS…) ----------
    let fimToast = null;
    function toast(texto) {
      const t = $('p-toast');
      t.textContent = texto;
      t.hidden = false;
      clearTimeout(fimToast);
      fimToast = setTimeout(() => { t.hidden = true; }, 3500);
    }
    async function compartilhar(id) {
      const a = conteudo.avisos.find((x) => x.id === id);
      if (!a) return;
      const texto = GC.textoCompartilharAviso(a, nomeCidade);
      const url = `${location.origin}${location.pathname}#/inicio`;
      // Celular: a janela de compartilhar do sistema. Sem ela: o texto pronto, com Copiar e WhatsApp.
      if (navigator.share) {
        try { await navigator.share({ title: a.titulo, text: texto, url }); return; } catch (e) { if (e && e.name === 'AbortError') return; }
      }
      const completo = `${texto}\n${url}`;
      $('p-comp-texto').value = completo;
      $('p-comp-whats').href = `https://wa.me/?text=${encodeURIComponent(completo)}`;
      $('p-dlg-compartilhar').showModal();
    }
    $('p-comp-copiar').onclick = async () => {
      const t = $('p-comp-texto');
      try { await navigator.clipboard.writeText(t.value); }
      catch (e) { t.focus(); t.select(); try { document.execCommand('copy'); } catch (e2) { /* fica selecionado para copiar à mão */ } }
      toast('Aviso copiado. Cole no WhatsApp ou no SMS para avisar alguém.');
    };

    // ---------- bairro pela localização do aparelho ----------
    $('p-geo').onclick = () => {
      const msg = $('p-geo-msg');
      if (!navigator.geolocation) { msg.textContent = 'Este navegador não informa a localização. Escolha o bairro na lista.'; return; }
      msg.textContent = 'Procurando a sua localização…';
      navigator.geolocation.getCurrentPosition((pos) => {
        const id = GC.bairroDoPonto(pos.coords.latitude, pos.coords.longitude);
        if (id) { $('p-sel-bairro').value = id; msg.textContent = `Você está em ${nomeBairro(id)}. Confira e toque em Salvar.`; }
        else msg.textContent = `Sua localização fica fora de ${nomeCidade} (cidade fictícia da demonstração). Escolha o bairro na lista.`;
      }, () => { msg.textContent = 'Não foi possível usar a localização. Escolha o bairro na lista.'; }, { timeout: 10000, maximumAge: 300000 });
    };

    // Aviso novo desde a última olhada: o leitor de tela ouve uma frase (sem reler a página).
    function anunciarNovos() {
      const ids = new Set(conteudo.avisos.map((a) => a.id));
      if (avisosVistos) {
        const novos = conteudo.avisos.filter((a) => !avisosVistos.has(a.id));
        if (novos.length) $('p-anuncio').textContent = `${novos.length > 1 ? `${novos.length} avisos novos` : 'Aviso novo'}: ${novos.map((a) => a.titulo).join('; ')}.`;
      }
      avisosVistos = ids;
    }

    function irPara(id) {
      const destino = `#/${id}`;
      if (location.hash !== destino) location.hash = destino; else mostrarRota([id]);
    }
    const telaGrande = () => !!(window.matchMedia && matchMedia('(min-width: 900px)').matches);
    // Mapa em tela cheia ou folha de pedidos por cima da página. A página guarda onde a pessoa estava
    // e trava a rolagem por baixo; ao fechar, volta para o mesmo lugar.
    function abrirModo(novo) {
      if (modo === novo) return;
      if (!modo) rolagemAntes = window.scrollY;
      const antes = modo;
      modo = novo;
      // Saída animada (sai mais rápido do que entra); uma troca no meio da saída termina a anterior na hora.
      if (fimSaida) { clearTimeout(fimSaida); fimSaida = null; document.querySelectorAll('.p-saindo').forEach((el) => el.classList.remove('p-saindo')); }
      if (antes && mov) {
        fimSaida = mov.sair([antes === 'mapa' ? $('sec-mapa') : $('p-folha')], () => { fimSaida = null; aplicarModo(); });
        if (fimSaida) return;
      }
      aplicarModo();
    }
    function aplicarModo() {
      const novo = modo;
      document.body.classList.toggle('p-com-mapa', novo === 'mapa');
      document.body.classList.toggle('p-com-folha', novo === 'folha');
      $('p-folha').hidden = novo !== 'folha';
      if (novo !== 'mapa' && bairroNoMapa) { bairroNoMapa = null; if (mapa) mapa.selecionarBairro(null, { voar: false }); desenharBairroNoMapa(); }
      if (novo === 'mapa' && telaGrande()) $('p-legenda-caixa').open = true;
      if (novo !== 'mapa') $('p-legenda-caixa').open = false;
      if (mapa) {
        if (mapa.rolagem) mapa.rolagem(novo === 'mapa');
        // O tamanho do mapa mudou: reenquadra a cidade (quem vai focar um ponto chama o foco depois).
        setTimeout(() => { mapa.redimensionar(); mapa.visaoGeral(); }, 0);
      }
    }
    const tituloJanela = (t) => { document.title = `${t ? `${t} · ` : ''}${nomeCidade} · Prefeitura`; };
    function focarTitulo(t) { if (t) { t.setAttribute('tabindex', '-1'); t.focus({ preventScroll: true }); } }
    let primeiraRota = true;
    function mostrarRota(partes, { focar = false } = {}) {
      const id = partes[0] || 'inicio';
      const suave = primeiraRota ? 'auto' : 'smooth';
      primeiraRota = false;
      if ((id === 'pedir' || id === 'pedidos') && pedidosUI) {
        const jaAberta = modo === 'folha';
        abrirModo('folha');
        pedidosUI.mostrar(partes, { focar });
        if (jaAberta && mov) mov.pulsoDeClasse($('aba-pedidos'), 'p-troca', 600);
        $('p-folha').querySelector('.p-folha-caixa').scrollTop = 0;
        tituloJanela(pedidosUI.titulo());
        return;
      }
      if (id === 'mapa') {
        abrirModo('mapa');
        garantirMapa();
        tituloJanela('Mapa');
        if (focar) focarTitulo($('t-mapa'));
        return;
      }
      const vinhaDe = modo;
      abrirModo(null);
      const s = SECOES[id] || SECOES.inicio;
      tituloJanela(s.titulo);
      if (id === 'numeros') { const d = $('sec-numeros').querySelector('details.p-numeros-todos'); if (d) d.open = true; }
      // Fechou o mapa ou a folha: volta para onde estava na página.
      if (vinhaDe && (id === 'inicio' || !SECOES[id])) { window.scrollTo(0, rolagemAntes); return; }
      if (id === 'inicio' || !SECOES[id]) window.scrollTo({ top: 0, behavior: suave });
      else { const el = $(s.sec); if (el) el.scrollIntoView({ behavior: suave, block: 'start' }); }
      if (focar) focarTitulo(id === 'inicio' ? $('t-inicio') : $(s.sec) && $(s.sec).querySelector('h2, h3'));
    }
    const lerRota = () => String(location.hash || '').replace(/^#\/?/, '').split('/').filter(Boolean);
    window.addEventListener('hashchange', () => mostrarRota(lerRota(), { focar: true }));
    // Link para a rota em que já se está (ex.: #/bairro depois de rolar a página): rola de novo até a seção.
    document.addEventListener('click', (e) => {
      const a = e.target.closest && e.target.closest('a[href^="#/"]');
      if (a && a.getAttribute('href') === location.hash) { e.preventDefault(); mostrarRota(lerRota(), { focar: true }); }
    });
    // Esc fecha o mapa em tela cheia ou a folha (os diálogos nativos cuidam do próprio Esc).
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape' || !modo || document.querySelector('dialog[open]')) return;
      if (e.target && e.target.id === 'p-busca-geral') return;
      location.hash = '#/inicio';
    });

    // Comunicado publicado no painel do gestor em outra aba do navegador: aparece aqui na hora.
    // Pedido mudou em outra aba (o painel encaminhou, a equipe chegou…): relê o registro e redesenha.
    window.addEventListener('storage', (e) => { if (GC.CHAVE_PEDIDOS && e.key === GC.CHAVE_PEDIDOS) { GC.pedidos.recarregar(); desenhar(); } });
    window.addEventListener('storage', (e) => { if (GC.CHAVE_ACOES_PREFEITO && e.key === GC.CHAVE_ACOES_PREFEITO) { GC.acoesPrefeito.recarregar(); desenhar(); } });
    window.addEventListener('storage', (e) => { if (e.key === CHAVE_GABINETES || e.key === CHAVE_BAIRRO) { if (e.key === CHAVE_BAIRRO) bairro = e.newValue; desenhar(); } });
    // A cidade anda (como no painel do gestor): ocorrências mudam de situação e avisos entram e saem.
    setInterval(() => { store.passoAutomatico(); desenhar(); }, PASSO_MS);

    if (GC.pedidos) GC.pedidos.assinar((e) => { if (e.tipo === 'situacao') desenhar(); });
    if (mov) mov.chegar();
    desenhar();
    garantirMapa();
    if (mapa && mapa.rolagem) mapa.rolagem(false);
    mostrarRota(lerRota());
    // Seções aparecem ao entrar na tela; o placar dos números conta de 0 na primeira vez.
    if (mov) {
      mov.revelar([$('sec-meus-pedidos'), $('sec-carta'), $('sec-bairro'), $('sec-regiao'), $('sec-avisos'), $('sec-epoca'), $('sec-numeros'), $('sec-atendimento')], (el) => {
        if (el.id === 'sec-numeros') el.querySelectorAll('.p-placar b[data-v]').forEach((b) => mov.contar(b, Number(b.dataset.v)));
      });
    }
  });
})(window.GC = window.GC || {});
