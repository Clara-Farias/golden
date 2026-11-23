(function (GC) {
  // A cidade "anda sozinha" na demonstração: ocorrências novas a cada 45 s (ou na tecla N), as secretarias
  // respondendo às ações do prefeito, o aviso discreto de novidade e a Maia comentando os eventos.
  // Modo demonstração (?demo=1): nada chega sozinho; quem apresenta dispara com a tecla N.
  const AVANCOS_MS = [6000, 16000]; // depois de uma ação do prefeito: em_campo → resolvida
  const NOVA_OCORRENCIA_MS = 45000;
  const PASSO_CIDADE_MS = 20000; // a cidade anda sozinha (e o relógio dos prazos é redesenhado)
  const FALA_ACAO = { priorizar: 'priorizada' };
  // A resposta é sempre da secretaria: ninguém responde cobrança nem pedido de ajuda sozinho. Só com ?simular=1
  // (apresentação com uma aba só) uma secretaria simulada responde.
  const SIMULAR = (() => { try { return new URLSearchParams(window.location.search).has('simular'); } catch (e) { return false; } })();
  GC.simulandoSecretarias = SIMULAR;
  // Com ?simular=1, cobrança: a secretaria simulada responde entre 8 e 20 s depois; o tempo da previsão anda comprimido
  // (1 min previsto = 1 s). A aba do secretário marca presença a cada 15 s; com presença de menos de 45 s,
  // quem responde é a pessoa e nada é simulado.
  const RESPOSTA_SIMULADA_MS = [8000, 20000];
  const PRESENCA_MS = 15000;
  const PRESENCA_VALE_MS = 45000;
  const SEGUNDOS_POR_MIN = 1000;
  const EVIDENCIA_SIMULADA = 'Equipe concluiu o atendimento no local. Área liberada e registro fotográfico no sistema da secretaria.';
  const SEV_AVISO = { critica: 'Crítica', alta: 'Alta', media: 'Média' };

  GC.criarAppSimulacao = function (app) {
    const { $, store, areasPerfil, daPasta, doPerfil } = app;

    // Ocorrência de tipo com regra pausada fica retida: a Maia avisa, e ela entra ao reativar.
    // As 4 do roteiro saem primeiro. Depois (o relógio de 45 s esgota o estoque em ~3 min e o "N" ficava
    // mudo), reaproveita as mesmas como modelo, com outro id e um pouco deslocadas no mapa.
    const extras = GC.data.ocorrenciasExtras.slice();
    const moldes = GC.data.ocorrenciasExtras;
    let reaproveitadas = 0;
    function proximaExtra() {
      if (extras.length) return extras.shift();
      if (!moldes.length) return null;
      const m = moldes[reaproveitadas % moldes.length];
      reaproveitadas++;
      const desvio = () => (Math.random() - 0.5) * 0.004; // ~200 m: continua no mesmo bairro
      return Object.assign({}, m, {
        id: `${m.id}-r${reaproveitadas}`, areasEnvolvidas: [...m.areasEnvolvidas],
        lat: +(m.lat + desvio()).toFixed(5), lng: +(m.lng + desvio()).toFixed(5),
      });
    }
    function novaOcorrencia() {
      const o = proximaExtra();
      if (o && !store.adicionar(o)) {
        const r = store.regraPara ? store.regraPara(o) : null;
        const ate = r && r.pausa && r.pausa.ate ? new Date(r.pausa.ate) : null;
        const quando = ate ? `até ${String(ate.getHours()).padStart(2, '0')}h${String(ate.getMinutes()).padStart(2, '0')}` : 'até ser reativada na Central de alertas';
        if (doPerfil(o)) app.chat.ia({ texto: `🔕 Alerta retido: ${o.titulo}. A regra “${r ? r.nome : o.tipo}” está pausada ${quando}; ele entra assim que ela voltar.` }, { aviso: { rotulo: 'Alerta retido' } });
        app.render(); // a retenção não emite evento: a Central precisa mostrar a contagem
      }
    }

    // Aviso quando algo novo chega: os números mudam com a tela parada e o prefeito precisa saber por quê.
    // Alerta novo vira um cartão (css/aviso-novo.css): ícone da secretaria na cor da gravidade, que chega
    // como o pino (movimento.md, item 2) e recebe o alvo (item 3); o que, onde e quantas pessoas
    // (tom-de-voz.md); "Ver no mapa" e "Ver detalhes". A barra embaixo é o tempo que falta: parar o mouse
    // em cima (ou o foco do teclado) segura o aviso. Chegando outro com o cartão aberto, ele troca e conta
    // quantos chegaram; o "+N" leva à Central de alertas.
    const aviso = $('aviso-novo');
    const AVISO_MS = 8000;
    const AVISO_ALERTA_MS = 10000;
    let chegaramJuntos = 0;
    let fimSaida = null;
    function fecharAviso() {
      if (aviso.hidden || aviso.classList.contains('saindo')) return;
      aviso.classList.remove('entrando'); // a animação de entrada prende o transform; sem ela a saída anda
      aviso.classList.add('saindo');
      clearTimeout(fimSaida);
      fimSaida = setTimeout(() => { aviso.hidden = true; aviso.classList.remove('saindo'); chegaramJuntos = 0; }, 200);
    }
    // Com a linha do tempo aberta, o mapa mostra outro instante e a base é da barra: o aviso vira uma linha
    // discreta embaixo do cabeçalho (css/aviso-novo.css), sem cartão, sem botões e por menos tempo.
    const naLinhaTempo = () => document.body.classList.contains('com-linha-tempo');
    function mostrarAviso(html, { id, alerta, sev, discreto } = {}) {
      clearTimeout(fimSaida);
      aviso.className = `aviso-novo vidro${alerta ? ` aviso-alerta ${sev}` : ''}${discreto ? ' aviso-discreto' : ''}${id ? ' clicavel' : ''}`;
      aviso.style.setProperty('--aviso-ms', `${discreto ? AVISO_MS * 0.75 : alerta ? AVISO_ALERTA_MS : AVISO_MS}ms`);
      aviso.innerHTML = `${html}<button type="button" class="aviso-fechar" data-aviso="fechar" aria-label="Fechar aviso">✕</button><span class="aviso-tempo" aria-hidden="true"></span>`;
      aviso.hidden = false;
      void aviso.offsetWidth; // reinicia as animações de entrada quando um aviso troca o outro
      aviso.classList.add('entrando');
      aviso.onclick = (ev) => {
        const b = ev.target.closest('[data-aviso]');
        const acao = b ? b.dataset.aviso : (id ? 'detalhar' : null);
        if (!acao) return;
        ev.stopPropagation();
        aviso.hidden = true;
        chegaramJuntos = 0;
        if (acao === 'mapa') app.focar(id);
        else if (acao === 'detalhar') app.detalhar(id);
        else if (acao === 'central') location.hash = '#/alertas';
      };
      const tempo = aviso.querySelector('.aviso-tempo');
      tempo.addEventListener('animationend', fecharAviso, { once: true });
    }
    function avisar(html, id) {
      chegaramJuntos = 0;
      mostrarAviso(`<span class="aviso-texto">${html}</span>`, { id, discreto: naLinhaTempo() });
    }
    // Alerta novo: "Novo alerta crítico: o quê, onde, quantas pessoas" (tom-de-voz.md).
    function avisarAlertaNovo(o) {
      const b = GC.data.bairros.find((x) => x.id === o.bairroId);
      const a = GC.data.areas.find((x) => x.id === o.area);
      const esc = GC.escaparHtml;
      chegaramJuntos = aviso.hidden || aviso.classList.contains('saindo') ? 1 : chegaramJuntos + 1;
      const afetados = o.afetados ? ` · cerca de ${Number(o.afetados).toLocaleString('pt-BR')} ${o.afetados === 1 ? 'pessoa afetada' : 'pessoas afetadas'}` : '';
      const mais = chegaramJuntos > 1
        ? `<button type="button" class="aviso-mais" data-aviso="central" title="Abrir a Central de alertas">+${chegaramJuntos - 1} ${chegaramJuntos === 2 ? 'outro' : 'outros'} agora</button>` : '';
      const cont = $('alertas-contador');
      const acender = () => { if (cont) { cont.classList.remove('num-mudou'); void cont.offsetWidth; cont.classList.add('num-mudou'); } };
      if (naLinhaTempo()) {
        // Uma linha só: gravidade, o quê e onde. O clique abre o detalhe; a câmera não sai do instante escolhido.
        mostrarAviso(`<span class="aviso-ponto" aria-hidden="true"></span><span class="so-leitor">Novo alerta</span><span class="aviso-sev">${SEV_AVISO[o.severidade]}</span><span class="aviso-texto"><b>${esc(o.titulo)}</b>${b ? ` · ${esc(b.nome)}` : ''}</span>${mais}`,
          { id: o.id, alerta: true, sev: o.severidade, discreto: true });
        acender();
        return;
      }
      mostrarAviso(`
        <span class="aviso-icone" aria-hidden="true"><span class="aviso-icone-alvo"></span><span class="aviso-icone-tile">${a ? a.emoji : '⚠'}</span></span>
        <span class="aviso-corpo">
          <span class="aviso-topo"><span class="aviso-rotulo">Novo alerta</span><span class="aviso-sev">${SEV_AVISO[o.severidade]}</span><span class="aviso-agora">agora</span>${mais}</span>
          <b class="aviso-titulo">${esc(o.titulo)}</b>
          <span class="aviso-meta">${esc(b ? b.nome : '')}${afetados} · encaminhado à ${esc(a ? a.nome : 'secretaria')}</span>
          <span class="aviso-acoes">
            <button type="button" class="aviso-btn primario" data-aviso="detalhar">Ver detalhes</button>
            <button type="button" class="aviso-btn" data-aviso="mapa">Ver no mapa</button>
          </span>
        </span>`, { id: o.id, alerta: true, sev: o.severidade });
      // Número mudou (movimento.md, item 7): o contador do botão Alertas acende uma vez.
      acender();
    }

    // ---- cobranças: secretaria simulada, presença do secretário e avisos entre as abas ----
    const cb = GC.cobrancas;
    const perfilAtual = GC.perfil || { id: 'prefeito' };
    const cidade = GC.cidade ? GC.cidade.id : 'media';
    const chavePresenca = (area) => `gc.presenca.${cidade}.${area}`;
    const temGente = (area) => {
      try { return Date.now() - Number(window.localStorage.getItem(chavePresenca(area)) || 0) < PRESENCA_VALE_MS; } catch (e) { return false; }
    };
    if (perfilAtual.id === 'setor' && perfilAtual.area) {
      const marcar = () => { try { window.localStorage.setItem(chavePresenca(perfilAtual.area), String(Date.now())); } catch (e) { /* sem armazenamento */ } };
      marcar();
      setInterval(marcar, PRESENCA_MS);
    }
    const secretariaNome = (area) => (GC.data.areas.find((a) => a.id === area) || { secretaria: { nome: 'Secretaria' } }).secretaria.nome;
    const quemSimulado = (area) => ((GC.data.responsaveis || {})[area] || [])[0] || secretariaNome(area);
    const sorteio = (id) => [...id].reduce((s, ch) => s + ch.charCodeAt(0), 0) % 10;
    const depois = (ms, fn) => setTimeout(fn, ms);
    // Só segue se a cobrança ainda está no estado esperado e ninguém da pasta entrou nesse meio-tempo.
    const ainda = (id, estados) => { const c = cb.buscar(id); return c && estados.includes(c.estado) && !temGente(c.area) ? c : null; };

    // Previsão dada: em campo na metade do tempo e resolvida com evidência no fim (tempo comprimido).
    function cumprirPrevisao(id, minutos) {
      depois((minutos / 2) * SEGUNDOS_POR_MIN, () => {
        const c = ainda(id, ['respondida']);
        const o = c && store.buscar(c.ocorrenciaId);
        if (o && o.status === 'encaminhada') store.avancar(o.id);
      });
      depois(minutos * SEGUNDOS_POR_MIN, () => {
        const c = ainda(id, ['respondida']);
        if (!c) return;
        cb.encerrar(id, { texto: EVIDENCIA_SIMULADA, simulada: true }, quemSimulado(c.area));
        store.resolver(c.ocorrenciaId, 'evidência enviada pela secretaria');
      });
    }
    function preverSimulado(id, minutos) {
      const c = ainda(id, ['aberta', 'respondida']);
      if (!c) return;
      cb.responder(id, { tipo: 'previsao', minutos, simulada: true }, quemSimulado(c.area));
      cumprirPrevisao(id, minutos);
    }
    // 6 em 10 dão previsão; 2 justificam (e mandam previsão depois); 1 pede recurso; 1 pede novo prazo.
    function secretariaSimulada(id) {
      if (!SIMULAR || perfilAtual.id !== 'prefeito') return;
      const [min, max] = RESPOSTA_SIMULADA_MS;
      depois(min + Math.random() * (max - min), () => {
        const c = ainda(id, ['aberta']);
        if (!c) return;
        const n = sorteio(c.id);
        const quem = quemSimulado(c.area);
        if (n <= 5) preverSimulado(id, 20 + n * 5);
        else if (n <= 7) {
          const motivo = n === 6 ? 'falta_equipe' : 'clima';
          const texto = n === 6 ? 'As duas equipes do turno estão em outro atendimento; a primeira que liberar segue para lá.' : 'Chuva forte no bairro; a equipe sai assim que der para trabalhar com segurança.';
          cb.responder(id, { tipo: 'justificativa', motivo, texto, simulada: true }, quem);
          depois(30000, () => preverSimulado(id, 40));
        } else if (n === 8) {
          cb.responder(id, { tipo: 'recurso', pedido: 'veiculo', texto: 'Um caminhão basculante por 4 h para retirar o material.', simulada: true }, quem);
          depois(40000, () => preverSimulado(id, 45));
        } else cb.pedirNovoPrazo(id, 6, 'A equipe só consegue entrar depois que a água baixar; previsão para o fim da tarde.', quem, true);
      });
    }
    // O prefeito decidiu o novo prazo pedido pela secretaria simulada: aprovado, ela cumpre; recusado, manda previsão.
    if (cb) cb.assinar((e) => {
      if (e.tipo !== 'decisao' || perfilAtual.id !== 'prefeito' || !e.cobranca || temGente(e.cobranca.area)) return;
      const c = e.cobranca;
      const r = c.respostas[c.respostas.length - 1];
      if (!c.respostas.some((x) => x.tipo === 'novo_prazo' && x.simulada)) return;
      if (r.aprovado) cumprirPrevisao(c.id, 30);
      else depois(8000, () => preverSimulado(c.id, 40));
    });

    // Avisos: o que o outro lado fez (a resposta da secretaria na aba do prefeito; a cobrança e a decisão
    // do prefeito na aba do secretário). Compara com o último retrato; não anuncia o que estava lá ao abrir.
    const LADO_SECRETARIA = ['previsao', 'justificativa', 'recurso', 'novo_prazo', 'evidencia'];
    const visto = new Map();
    const marca = (c) => `${c.estado}|${c.respostas.length}|${c.vezes}`;
    if (cb) cb.todas().forEach((c) => visto.set(c.id, marca(c)));
    function anunciar(c, r, nova) {
      const { chat } = app;
      const titulo = c.retrato.titulo;
      const sec = secretariaNome(c.area);
      const oid = store.buscar(c.ocorrenciaId) ? c.ocorrenciaId : null;
      if (perfilAtual.id === 'prefeito') {
        if (!r || !LADO_SECRETARIA.includes(r.tipo)) return;
        const extra = r.texto ? ` ${r.texto}` : '';
        if (r.tipo === 'previsao') chat.secretaria(c.area, `${sec}: equipe chega em ${GC.tempoTexto(r.minutos)} em "${titulo}".${extra}`);
        else if (r.tipo === 'justificativa') chat.secretaria(c.area, `${sec} sobre "${titulo}": ${GC.MOTIVOS_JUSTIFICATIVA[r.motivo].toLowerCase()}.${extra}`);
        else if (r.tipo === 'recurso') {
          chat.secretaria(c.area, `${sec} pede recurso para "${titulo}": ${GC.PEDIDOS_RECURSO[r.pedido].toLowerCase()}.${extra}`);
          avisar(`📣 <b>${GC.escaparHtml(sec)}</b> pede recurso: ${GC.escaparHtml(titulo)} <u>ver</u>`, oid);
        } else if (r.tipo === 'novo_prazo') {
          chat.secretaria(c.area, `${sec} pede mais ${r.horas} h para "${titulo}".${extra} Aprove ou recuse em Alertas → Cobranças.`);
          avisar(`📣 <b>${GC.escaparHtml(sec)}</b> pede mais ${r.horas} h: ${GC.escaparHtml(titulo)} <u>ver</u>`, oid);
        } else if (r.tipo === 'evidencia' && !r.semEvidencia) chat.secretaria(c.area, `${sec}: "${titulo}" resolvida.${extra}`);
        return;
      }
      if (perfilAtual.id !== 'setor' || c.area !== perfilAtual.area) return;
      if (nova) avisar(`📣 <b>O prefeito cobrou</b> ${GC.escaparHtml(titulo)} · responda em até ${GC.tempoTexto(Math.max(1, Math.round((c.prazoRespostaEm - GC.agora()) / 60000)))} <u>ver</u>`, oid);
      else if (r && r.tipo === 'recobranca') avisar(`📣 <b>O prefeito cobrou de novo</b> ${GC.escaparHtml(titulo)} <u>ver</u>`, oid);
      else if (r && r.tipo === 'decisao_recurso') avisar(`📣 O prefeito <b>${r.aprovado ? 'aprovou' : 'negou'} o recurso</b>: ${GC.escaparHtml(titulo)} <u>ver</u>`, oid);
      else if (r && r.tipo === 'decisao') avisar(`📣 O prefeito <b>${r.aprovado ? `aprovou mais ${r.horas} h` : 'recusou o novo prazo'}</b>: ${GC.escaparHtml(titulo)} <u>ver</u>`, oid);
    }
    // Aviso antecipado (js/caixa-entrada.js): na aba do secretário, uma vez por ocorrência, quando ela entra na
    // janela de 2 h sem equipe. As que já estavam na janela ao abrir não viram aviso (estão na caixa de entrada).
    const antecipadas = new Set();
    function checarAntecipadas(avisarAgora = true) {
      if (perfilAtual.id !== 'setor' || !GC.vaoEstourar) return;
      GC.vaoEstourar(store.ocorrencias([perfilAtual.area]), GC.agora()).forEach((o) => {
        if (antecipadas.has(o.id)) return;
        antecipadas.add(o.id);
        if (avisarAgora) avisar(`⏳ <b>Vai estourar em ${GC.tempoCurto(GC.prazoRestanteMin(o))}</b> ${GC.escaparHtml(o.titulo)} · sem equipe <u>despachar</u>`, o.id);
      });
    }
    checarAntecipadas(false);
    setInterval(() => checarAntecipadas(true), PASSO_CIDADE_MS);

    // ---- pedidos de ajuda entre secretarias (js/ajudas.js) ----
    // Sem a aba da pasta pedida aberta, ela é simulada na aba de quem pediu: 7 em 10 aceitam (e concluem no tempo
    // comprimido), 3 em 10 recusam. Avisos: a pasta pedida recebe o pedido; quem pediu, a resposta e a decisão do
    // prefeito; o prefeito, o pedido levado a ele.
    const aj = GC.ajudas;
    const MOTIVO_RECUSA = 'As equipes do turno estão todas em atendimento; não dá para mandar ninguém agora.';
    function pastaSimulada(id) {
      if (!SIMULAR) return;
      const [min, max] = RESPOSTA_SIMULADA_MS;
      depois(min + Math.random() * (max - min), () => {
        const a = aj.buscar(id);
        if (!a || a.estado !== 'aberto' || temGente(a.para)) return;
        const quem = quemSimulado(a.para);
        if (sorteio(a.id) <= 6) {
          aj.aceitar(id, 30, 'Equipe sai da base agora.', quem, true);
          depois(30 * SEGUNDOS_POR_MIN, () => { const x = aj.buscar(id); if (x && x.estado === 'aceito' && !temGente(x.para)) aj.concluir(id, 'Apoio prestado no local.', quem, true); });
        } else aj.recusar(id, MOTIVO_RECUSA, quem, true);
      });
    }
    const vistoAj = new Map();
    const marcaAj = (a) => `${a.estado}|${a.respostas.length}|${a.escalado}`;
    if (aj) aj.todas().forEach((a) => vistoAj.set(a.id, marcaAj(a)));
    const AVISO_AJUDA = {
      aceito: (a, r) => `aceitou: chega em ${GC.tempoTexto(r.minutos)}`,
      recusado: () => 'recusou',
      concluido: () => 'concluiu a ajuda',
      determinado: () => 'teve a ajuda determinada pelo prefeito',
      arquivado: () => 'teve o pedido arquivado pelo prefeito',
    };
    function anunciarAjuda(a, r, novo) {
      const { chat } = app;
      const oid = store.buscar(a.ocorrenciaId) ? a.ocorrenciaId : null;
      const titulo = GC.escaparHtml(a.retrato.titulo);
      const de = GC.escaparHtml(secretariaNome(a.de));
      const para = GC.escaparHtml(secretariaNome(a.para));
      if (perfilAtual.id === 'prefeito') {
        if (r && r.tipo === 'escalado') {
          chat.secretaria(a.de, `${secretariaNome(a.de)} levou a você o pedido de ajuda à ${secretariaNome(a.para)} sobre "${a.retrato.titulo}": ${GC.resumoAjuda(a).replace(/^🤝 /, '')}. Determine ou arquive em Alertas → Cobranças.`);
          avisar(`🤝 <b>${de}</b> levou a você um pedido à ${para}: ${titulo} <u>ver</u>`, oid);
        }
        return;
      }
      if (perfilAtual.id !== 'setor') return;
      if (r && r.tipo === 'determinado' && a.para === perfilAtual.area) avisar(`🤝 <b>O prefeito determinou</b>: ajude a ${de} em até 2 h · ${titulo} <u>ver</u>`, oid);
      if (novo && a.para === perfilAtual.area) avisar(`🤝 <b>${de} pede ajuda</b>: ${GC.escaparHtml(GC.PEDIDOS_AJUDA[a.tipo].toLowerCase())} · ${titulo} <u>ver</u>`, oid);
      if (r && a.de === perfilAtual.area && AVISO_AJUDA[r.tipo]) {
        const quem = r.tipo === 'determinado' || r.tipo === 'arquivado' ? 'O pedido' : `A ${para}`;
        avisar(`🤝 <b>${quem} ${AVISO_AJUDA[r.tipo](a, r)}</b>: ${titulo} <u>ver</u>`, oid);
      }
    }
    if (aj) {
      aj.assinar((e) => {
        if (e.tipo === 'novo' && e.ajuda && perfilAtual.id === 'setor' && e.ajuda.de === perfilAtual.area && !temGente(e.ajuda.para)) pastaSimulada(e.ajuda.id);
        aj.todas().forEach((a) => {
          const antes = vistoAj.get(a.id);
          const agoraMarca = marcaAj(a);
          if (antes === agoraMarca) return;
          vistoAj.set(a.id, agoraMarca);
          const nAntes = antes ? Number(antes.split('|')[1]) : 0;
          if (!antes) anunciarAjuda(a, null, true);
          a.respostas.slice(nAntes).forEach((r) => anunciarAjuda(a, r, false));
        });
      });
    }

    // ---- mais ações do prefeito (js/acoes-prefeito.js): explicação, delegação e adiamento ----
    // Com ?simular=1 e sem a aba da pasta aberta, a secretaria simulada explica por escrito. Avisos: a pasta recebe o
    // pedido de explicação e o adiamento; quem recebeu a delegação, a delegação; o prefeito, a explicação e o retorno.
    const ap = GC.acoesPrefeito;
    const EXPLICACAO_SIMULADA = {
      encaminhada: 'As equipes do turno estavam em atendimentos mais graves. Esta é a próxima da fila; a equipe sai assim que a atual liberar.',
      em_campo: 'A equipe já está no local. O atraso foi na chegada do material; o serviço termina ainda hoje.',
    };
    function explicacaoSimulada(id) {
      if (!SIMULAR || perfilAtual.id !== 'prefeito') return;
      const [min, max] = RESPOSTA_SIMULADA_MS;
      depois(min + Math.random() * (max - min), () => {
        const r = ap.buscar(id);
        if (!r || r.estado !== 'aberta' || temGente(r.area)) return;
        const o = store.buscar(r.ocorrenciaId);
        ap.explicar(id, EXPLICACAO_SIMULADA[o && o.status === 'em_campo' ? 'em_campo' : 'encaminhada'], quemSimulado(r.area), true);
      });
    }
    const vistoAp = new Map();
    const marcaAp = (r) => `${r.estado}|${r.passos.length}`;
    function anunciarAcaoPrefeito(r, p, novo) {
      const { chat } = app;
      const oid = store.buscar(r.ocorrenciaId) ? r.ocorrenciaId : null;
      const titulo = GC.escaparHtml(r.retrato.titulo);
      const eu = GC.usuarioAtual ? GC.usuarioAtual() : null;
      if (novo && r.tipo === 'delegacao' && eu && r.para === eu.id) { avisar(`👤 <b>${GC.escaparHtml(r.de.quem)} delegou a você</b> ${titulo} <u>ver</u>`, oid); return; }
      if (perfilAtual.id === 'prefeito') {
        if (p && p.tipo === 'resposta') {
          chat.secretaria(r.area, `${secretariaNome(r.area)} explica "${r.retrato.titulo}": ${p.texto}`);
          avisar(`❓ <b>${GC.escaparHtml(secretariaNome(r.area))} explicou</b> ${titulo} <u>ler</u>`, oid);
        } else if (p && p.tipo === 'retorno') avisar(`👤 <b>${GC.escaparHtml(p.quem)} deu o retorno</b> ${titulo} <u>ver</u>`, oid);
        return;
      }
      if (perfilAtual.id !== 'setor' || r.area !== perfilAtual.area) return;
      if (novo && r.tipo === 'explicacao') avisar(`❓ <b>O prefeito pede explicação</b> ${titulo} · responda em até ${GC.tempoTexto(Math.max(1, Math.round((r.prazoRespostaEm - GC.agora()) / 60000)))} <u>ver</u>`, oid);
      else if (p && p.tipo === 'pergunta') avisar(`❓ <b>O prefeito perguntou de novo</b> ${titulo} <u>ver</u>`, oid);
      else if (novo && r.tipo === 'adiamento') avisar(`🕰 <b>O prefeito adiou</b> ${titulo}: ${GC.escaparHtml(GC.MOTIVOS_ADIAMENTO[r.motivo].toLowerCase())} <u>ver</u>`, oid);
      else if (novo && r.tipo === 'reconhecimento') {
        chat.secretaria(r.area, `👏 O prefeito reconheceu o trabalho em "${r.retrato.titulo}": ${r.texto}`);
        avisar(`👏 <b>O prefeito reconheceu a equipe</b> ${titulo} <u>ver</u>`, oid);
      } else if (novo && r.tipo === 'agenda') avisar(`📅 <b>${GC.escaparHtml(GC.FORMAS_AGENDA[r.forma])} com o prefeito</b> ${GC.escaparHtml(GC.quandoAgenda(r.quando))} · ${titulo} <u>ver</u>`, oid);
      else if (novo && r.tipo === 'orgao') avisar(`🏢 <b>O prefeito acionou ${GC.escaparHtml(r.orgaoNome)}</b> sobre ${titulo} <u>ver</u>`, oid);
      else if (novo && r.tipo === 'aviso') avisar(`📢 <b>O prefeito avisou a população</b> sobre ${titulo} <u>ver</u>`, oid);
    }
    // Acompanhar (estrela do detalhe): quem acompanha recebe um aviso quando a ocorrência anda, na cidade ou
    // em outra aba. O que a própria pessoa faz nesta aba já aparece no aviso "Desfazer".
    const acompanho = (oid) => { const eu = GC.usuarioAtual ? GC.usuarioAtual() : null; return !!(ap && eu && ap.quemAcompanha(oid).includes(eu.id)); };
    const avisarAcompanhada = (o, texto) => avisar(`⭐ <b>${GC.escaparHtml(o.titulo)}</b> · ${GC.escaparHtml(texto)} <u>ver</u>`, o.status === 'resolvida' ? null : o.id);
    store.assinar((e) => {
      const o = e.ocorrencia;
      if (!o || e.tipo !== 'status' || !acompanho(o.id)) return;
      avisarAcompanhada(o, GC.situacao(o).replace(/^\S+ /, ''));
    });
    if (GC.operacao) GC.operacao.assinar((ev) => {
      if (ev.tipo !== 'remoto' || !ev.evento) return;
      const o = store.buscar(ev.evento.oid);
      if (o && acompanho(o.id)) avisarAcompanhada(o, `${ev.evento.quem || 'A secretaria'}: ${GC.situacao(o).replace(/^\S+ /, '')}`);
    });
    if (ap) {
      ap.todas().forEach((r) => vistoAp.set(r.id, marcaAp(r)));
      ap.assinar((e) => {
        if (e.registro && e.registro.tipo === 'explicacao' && (e.tipo === 'novo' || e.tipo === 'pergunta') && !temGente(e.registro.area)) explicacaoSimulada(e.registro.id);
        ap.todas().forEach((r) => {
          const antes = vistoAp.get(r.id);
          const agoraMarca = marcaAp(r);
          if (antes === agoraMarca) return;
          vistoAp.set(r.id, agoraMarca);
          const nAntes = antes ? Number(antes.split('|')[1]) : 0;
          if (!antes) anunciarAcaoPrefeito(r, null, true);
          r.passos.slice(nAntes).forEach((p) => anunciarAcaoPrefeito(r, p, false));
        });
      });
    }

    // ---- metas pactuadas (js/pactos.js): a proposta e o aceite do outro lado viram aviso ----
    // Pactos de demonstração na primeira abertura (em silêncio, antes de contar o que já foi visto: não viram aviso).
    if (GC.pactos && GC.semearPactosDemo) GC.semearPactosDemo(GC.pactos, GC.agora());
    const vistoPc = new Map();
    const pcMarca = (p) => p.historico.length;
    const meuLado = GC.ladoPacto ? GC.ladoPacto(perfilAtual) : 'prefeito';
    const nomeInd = (id) => ((GC.CATALOGO_INDICADORES || []).find((i) => i.id === id) || { nome: id }).nome;
    const todosPactos = () => GC.data.areas.flatMap((a) => GC.pactos.pactosDa(a.id));
    if (GC.pactos) {
      todosPactos().forEach((p) => vistoPc.set(p.indicadorId, pcMarca(p)));
      GC.pactos.assinar(() => {
        todosPactos().forEach((p) => {
          const antes = vistoPc.get(p.indicadorId) || 0;
          if (antes === pcMarca(p)) return;
          vistoPc.set(p.indicadorId, pcMarca(p));
          if (perfilAtual.id === 'setor' && p.area !== perfilAtual.area) return;
          p.historico.slice(antes).filter((h) => h.lado !== meuLado).forEach((h) => {
            const quem = h.lado === 'prefeito' ? 'O prefeito' : GC.escaparHtml(secretariaNome(p.area));
            const ind = GC.escaparHtml(nomeInd(p.indicadorId));
            const ate = h.prazo.split('-').reverse().join('/');
            if (h.tipo === 'aceite') avisar(`🎯 <b>${quem} aceitou a meta</b>: ${ind} · ${h.valor} até ${ate}`, null);
            else avisar(`🎯 <b>${quem} ${h.tipo === 'contraproposta' ? 'contrapropôs' : 'propôs'} meta</b>: ${ind} · ${h.valor} até ${ate}`, null);
          });
        });
      });

      // Ações do plano (fase 2): a cobrança do prefeito vira aviso para a pasta; a resposta (nova data ou feita),
      // aviso para o prefeito. Compara com o que esta aba já viu (a mudança pode vir de outra aba).
      const vistoAcao = new Map();
      const acoesAtivas = () => (GC.CATALOGO_INDICADORES || []).flatMap((i) => {
        const pl = GC.pactos.planoAtivo(i.id);
        return pl ? pl.acoes.map((a) => ({ a, area: pl.area, indId: i.id })) : [];
      });
      const marcaAcao = (a) => ({ cobr: (a.cobrancas || []).length, resp: (a.cobrancas || []).filter((c) => c.resposta).length });
      acoesAtivas().forEach(({ a, indId }) => vistoAcao.set(`${indId}#${a.id}`, marcaAcao(a)));
      GC.pactos.assinar(() => {
        acoesAtivas().forEach(({ a, area, indId }) => {
          const k = `${indId}#${a.id}`;
          const antes = vistoAcao.get(k) || { cobr: 0, resp: 0 };
          const agora = marcaAcao(a);
          vistoAcao.set(k, agora);
          const ind = GC.escaparHtml(nomeInd(indId));
          const txt = GC.escaparHtml(a.texto);
          if (agora.cobr > antes.cobr && meuLado === 'setor' && area === perfilAtual.area) {
            avisar(`📣 <b>O prefeito cobrou uma ação do plano</b>: ${txt} · ${ind}`, null);
          }
          if (agora.resp > antes.resp && meuLado === 'prefeito') {
            const r = a.cobrancas.filter((c) => c.resposta).pop().resposta;
            const quem = GC.escaparHtml(secretariaNome(area));
            avisar(r.tipo === 'feita' ? `✅ <b>${quem} fez a ação cobrada</b>: ${txt} · ${ind}`
              : `📣 <b>${quem} deu nova data</b>: ${txt} · até ${r.prazo.split('-').reverse().join('/')} · ${ind}`, null);
          }
        });
      });
    }

    // Operação da pasta feita em outra aba (js/operacao.js): o prefeito fica sabendo da devolução e da
    // resolução sem cobrança; a pasta que recebe uma devolvida, também. Despacho e chegada não viram recado.
    if (GC.operacao) GC.operacao.assinar((ev) => {
      if (ev.tipo !== 'remoto') return;
      const e = ev.evento;
      const { chat } = app;
      const oid = store.buscar(e.oid) ? e.oid : null;
      const titulo = GC.escaparHtml(e.titulo || '');
      // Quem fez desfez (js/app/desfazer.js): a ocorrência já voltou aqui; só avisa quem acompanha.
      if (e.tipo === 'desfazer') {
        if (!oid || !doPerfil(store.buscar(oid))) return;
        avisar(`↩ <b>${GC.escaparHtml(e.quem || 'A secretaria')} desfez</b>: ${GC.escaparHtml(e.rotulo || e.titulo || '')} <u>ver</u>`, oid);
        return;
      }
      // Gestos do gabinete (js/acoes-prefeito.js) que mudam a ocorrência: a pasta fica sabendo.
      if ((GC.TIPOS_GABINETE || []).includes(e.tipo)) {
        const o = store.buscar(e.oid);
        if (!o || !doPerfil(o) || GC.visaoDe(perfilAtual) !== 'pasta') return;
        if (e.tipo === 'definir_pasta') avisar(`🧭 <b>O prefeito definiu: é da ${GC.escaparHtml(secretariaNome(o.area))}</b> · ${titulo} <u>ver</u>`, oid);
        else if (e.tipo === 'reabrir') avisar(`🔓 <b>O prefeito reabriu</b> ${titulo}: ${GC.escaparHtml((GC.MOTIVOS_REABRIR || {})[e.motivo] || '')} <u>ver</u>`, oid);
        else if (e.tipo === 'falso_alarme') avisar(`🚫 <b>O prefeito marcou como falso alarme</b> ${titulo}`, null);
        return;
      }
      if (e.tipo === 'devolver') {
        const de = secretariaNome(e.area);
        const para = secretariaNome(e.para);
        if (perfilAtual.id === 'prefeito') {
          chat.secretaria(e.area, `${de} devolveu "${e.titulo}" para a ${para}: ${e.motivo}`);
          avisar(`↩ <b>${GC.escaparHtml(de)}</b> devolveu ${titulo} para a ${GC.escaparHtml(para)} <u>ver</u>`, oid);
        } else if (perfilAtual.id === 'setor' && perfilAtual.area === e.para) {
          avisar(`↩ <b>Chegou devolvida</b> da ${GC.escaparHtml(de)}: ${titulo} · “${GC.escaparHtml(e.motivo)}” <u>ver</u>`, oid);
        }
      }
      // Delegada ao diretor de unidade que está nesta aba.
      if (e.tipo === 'delegar' && e.usuarioId) {
        const eu = GC.usuarioAtual ? GC.usuarioAtual() : null;
        if (eu && eu.id === e.usuarioId) avisar(`👤 <b>Delegada a você</b>: ${titulo} <u>ver</u>`, oid);
      }
      // Com cobrança, a resposta da cobrança já avisou o prefeito.
      if (e.tipo === 'resolver' && perfilAtual.id === 'prefeito' && !(cb && cb.daOcorrencia(e.oid))) {
        chat.secretaria(e.area, `${secretariaNome(e.area)}: "${e.titulo}" resolvida. ${e.texto}`);
      }
    });

    if (cb) cb.assinar(() => {
      cb.todas().forEach((c) => {
        const antes = visto.get(c.id);
        const agora = marca(c);
        if (antes === agora) return;
        visto.set(c.id, agora);
        const nAntes = antes ? Number(antes.split('|')[1]) : 0;
        const novas = c.respostas.slice(nAntes);
        if (!antes) anunciar(c, null, true);
        novas.forEach((r) => anunciar(c, r, false));
        // Encerrada com evidência na outra aba: a ocorrência desta aba resolve junto.
        const ev = novas.find((r) => r.tipo === 'evidencia' && !r.semEvidencia);
        if (ev) store.resolver(c.ocorrenciaId, 'evidência enviada pela secretaria');
      });
    });

    // ---- pedidos do cidadão (js/pedidos.js) ----
    // O painel marca presença (sem ela, o portal atende sozinho), transforma cada ponto do registro em
    // ocorrência e grava de volta a situação que o morador lê no protocolo.
    const pd = GC.pedidos;
    if (pd) {
      const marcarPainel = () => { try { window.localStorage.setItem(`gc.presenca.${cidade}.painel`, String(Date.now())); } catch (e) { /* sem armazenamento */ } };
      marcarPainel();
      setInterval(marcarPainel, PRESENCA_MS);
      store.assinar((e) => { if (e.ocorrencia && e.tipo !== 'relatos') GC.sincronizarPedido(pd, e.ocorrencia); });
      GC.aplicarPedidos(store, pd);
      const subiu = new Set();
      store.assinar((e) => {
        const o = e.ocorrencia;
        if (e.tipo !== 'relatos' || !o || !o.subiuPorRelatos || subiu.has(o.id)) return;
        subiu.add(o.id);
        if (doPerfil(o)) avisar(`🔔 <b>${o.relatos} moradores relataram</b> ${GC.escaparHtml(o.titulo)} · <span class="sev-txt alta">subiu para Alta</span> <u>ver</u>`, o.id);
      });
      if (GC.CHAVE_PEDIDOS) window.addEventListener('storage', (e) => {
        if (e.key !== GC.CHAVE_PEDIDOS) return;
        pd.recarregar();
        GC.aplicarPedidos(store, pd);
        app.render();
        const aberta = app.gaveta && app.gaveta.abertaId && app.gaveta.abertaId();
        if (aberta && pd.daOcorrencia(aberta)) app.gaveta.atualizar(store.buscar(aberta), true);
      });
    }

    store.assinar((e) => {
      const { chat, mapa, gaveta, telao } = app;
      const o = e.ocorrencia;
      // Gestor do setor: o painel se atualiza com tudo, mas aviso, falas das secretarias e Maia só da pasta dele.
      const daMinhaPasta = !o || doPerfil(o);
      if (e.tipo === 'nova' && o && daMinhaPasta) {
        avisarAlertaNovo(o);
      }
      if (e.tipo === 'status' && o.status === 'resolvida') mapa.fecharPopup(o.id);
      app.render();
      // No telão o aviso fica escondido: ele mesmo interrompe o ciclo e voa até a nova (depois do render,
      // para o pino já estar no mapa).
      if (e.tipo === 'nova' && o) telao.novidade(o);
      if (e.tipo === 'status' && o.status === 'resolvida') telao.resolvida(o);
      gaveta.atualizar(o);
      if (e.tipo === 'acao' && e.acao === 'cobrar') {
        // A cobrança não resolve sozinha: espera a resposta do secretário (ou da secretaria simulada).
        const c = GC.cobrancas && GC.cobrancas.aberta(o.id);
        if (c) secretariaSimulada(c.id);
      } else if (e.tipo === 'acao') {
        if (o.acaoPrefeito === 'gabinete') o.areasEnvolvidas.filter((a) => !areasPerfil || areasPerfil.includes(a)).forEach((a) => chat.secretaria(a, GC.textoSecretaria(o, 'gabinete', a)));
        else if (daPasta(o)) chat.secretaria(o.area, GC.textoSecretaria(o, FALA_ACAO[o.acaoPrefeito]));
        AVANCOS_MS.forEach((ms) => setTimeout(() => store.avancar(o.id), ms));
      }
      // Resolvida com evidência da cobrança: a secretaria já falou (anunciar), sem repetir a fala genérica.
      const cobrancaFalou = () => { const c = cb && cb.daOcorrencia(o.id); const ev = c && c.respostas[c.respostas.length - 1]; return !!(ev && ev.tipo === 'evidencia' && !ev.semEvidencia); };
      if (e.tipo === 'status' && daPasta(o) && !(o.status === 'resolvida' && (cobrancaFalou() || o.evidencia || o.duplicadaDe))) chat.secretaria(o.area, GC.textoSecretaria(o, o.status));
      // Alerta novo não vai para a Maia: ele tem o aviso próprio e a gaveta Alertas.
      if (!daMinhaPasta || e.tipo === 'nova') return;
      Promise.resolve()
        .then(() => GC.ia.aoEvento(e, app.contexto()))
        .then((r) => { if (r && r.cenario !== 'evento_nova') chat.ia(GC.sanearResposta(r), { aviso: true }); }) // fora da conversa (aba Atividade)
        .catch((erro) => console.error(erro));
    });

    document.addEventListener('keydown', (ev) => {
      if (ev.key !== 'n' && ev.key !== 'N') return;
      if (ev.ctrlKey || ev.metaKey || ev.altKey || ev.repeat) return; // Ctrl+N é do navegador; segurar a tecla não cria várias
      const a = document.activeElement;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(a.tagName) || a.isContentEditable) return;
      novaOcorrencia();
    });
    // Modo demonstração (?demo=1): a cidade não anda sozinha, para nenhum alerta ou recado de secretaria
    // interromper a apresentação. Quem apresenta dispara um alerta novo com a tecla N, na hora certa.
    const modoDemo = new URLSearchParams(location.search).has('demo');
    document.body.classList.toggle('modo-demo', modoDemo);
    if (!modoDemo) setInterval(novaOcorrencia, NOVA_OCORRENCIA_MS);
    // Sem passo da cidade, redesenha mesmo assim: prazos estouram com a tela parada.
    // Pausa com hora para acabar (js/regras-alerta.js): quando vence, as retidas entram no próximo passo.
    // Escalonamento da regra (fase 3): a Maia avisa uma vez por degrau alcançado. Quem cobra continua sendo o Gabinete.
    const escaladas = new Set();
    function avisarEscaladas() {
      if (!GC.escalonamentoAlcancado || !app.chat) return;
      store.ocorrencias().forEach((o) => {
        GC.escalonamentoAlcancado(o).forEach((e) => {
          const chave = `${o.id}|${e.aposMin}|${e.acao}`;
          if (escaladas.has(chave)) return;
          escaladas.add(chave);
          if (!doPerfil(o)) return;
          const b = GC.data.bairros.find((x) => x.id === o.bairroId);
          const pede = e.acao === 'propor_cobranca' ? 'O botão para cobrar a secretaria já está no alerta.' : 'Ele subiu para "Precisam de você".';
          app.chat.ia({ texto: `🔔 ${o.titulo}${b ? ` (${b.nome})` : ''} está há ${GC.tempoTexto(GC.idadeMin(o))} sem equipe em campo. A regra “${o.regraDisparo.nome}” pede escalar. ${pede}` }, { aviso: { rotulo: 'Escalonamento' } });
        });
      });
    }
    // Metas pactuadas (js/pactos.js): ao abrir e a cada passo, a apuração das metas com o prazo vencido
    // (GC.apurarPactos; a semente de demonstração entra mais acima, antes dos avisos de meta). A apuração vira um aviso para quem acompanha a pasta.
    const apurarMetas = () => {
      if (!GC.pactos || !GC.apurarPactos || !GC.avaliarIndicadores) return;
      const feitas = GC.apurarPactos(GC.pactos, GC.avaliarIndicadores(GC.contextoIndicadores(store)), GC.agora());
      const pasta = GC.visaoDe && GC.visaoDe(perfilAtual) === 'pasta';
      feitas.filter((c) => !pasta || c.area === perfilAtual.area).forEach((c) => {
        const ind = (GC.CATALOGO_INDICADORES || []).find((i) => i.id === c.indicadorId) || { nome: c.indicadorId, unidade: '' };
        const f = (v) => GC.escaparHtml(GC.formatarIndicador(v, ind.unidade));
        avisar(`🎯 <b>Prazo da meta venceu</b>: ${GC.escaparHtml(ind.nome)} · meta ${f(c.meta)}, apurado ${f(c.valor)} · ${c.resultado === 'cumprida' ? 'cumprida' : 'não cumprida'}`, null);
      });
    };
    setTimeout(apurarMetas, 1800);
    setInterval(apurarMetas, PASSO_CIDADE_MS);

    // Regras que disparam sozinhas (fase 4): mede ao abrir, a cada passo e logo depois de uma regra mudar
    // (aqui ou em outra aba). O que nasce passa pelo store.adicionar e dispara o aviso de alerta novo.
    const medir = () => { if (store.avaliarRegras) store.avaliarRegras(); };
    setTimeout(medir, 1500);
    if (store.regrasAlerta) {
      let pendente = null;
      store.regrasAlerta.assinar(() => { clearTimeout(pendente); pendente = setTimeout(medir, 300); });
    }
    setInterval(() => {
      if (store.sincronizarRegras) store.sincronizarRegras();
      medir();
      avisarEscaladas();
      if (modoDemo || !store.passoAutomatico()) app.render();
    }, PASSO_CIDADE_MS);

    return { novaOcorrencia };
  };
})(window.GC = window.GC || {});
