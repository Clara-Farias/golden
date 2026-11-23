(function (GC) {
  // Portal do servidor (servidor.html): a página de quem executa as demandas de uma pasta. Três telas, pela rota:
  //   #/                 Minha fila (GC.filaDoServidor, js/servidor-fila.js): o que espera a pessoa agora;
  //   #/demandas[/<id>]  as demandas passadas a ela e o detalhe, com Começar, Dar notícia, Tenho uma dúvida,
  //                      Responder cobrança e Concluir;
  //   #/conta            os dados da pessoa, o tema e a demonstração (ver como outro servidor, ir ao painel).
  // As demandas são o mesmo registro do painel (js/tarefas.js, gc.tarefas.<cidade>): o que a pessoa faz aqui aparece
  // na hora para quem passou, pelo evento storage, e vice-versa. Permissão: GC.podeNaTarefa; auditoria tarefa_*.
  // Spec: docs/specs/2026-11-17-vila-dourada-portal-do-servidor-design.md (fase 1).
  if (GC.redirecionando) return;
  const $ = (id) => document.getElementById(id);
  const esc = GC.escaparHtml;
  const ic = (nome, cls) => GC.icone(nome, cls);
  const MIN = 60000;
  const DIA = 1440 * MIN;
  const agora = () => GC.agora();
  const reg = GC.tarefas;
  const perfil = GC.perfil;
  // Gabinetes de crise: o mesmo registro do painel (gc.gabinetes.<cidade>). Antes de cada gesto, relê (a sala muda
  // em outras abas o tempo todo) para não gravar por cima do que o painel acabou de fazer.
  const CHAVE_GABINETES = `gc.gabinetes.${GC.cidade ? GC.cidade.id : 'media'}`;
  const gabinetes = GC.criarGabinetes({
    armazenamento: {
      ler() { try { return JSON.parse(localStorage.getItem(CHAVE_GABINETES)); } catch (e) { return null; } },
      gravar(o) { try { localStorage.setItem(CHAVE_GABINETES, JSON.stringify(o)); } catch (e) { /* sem armazenamento */ } },
    },
  });
  GC.gabinetesServidor = gabinetes;
  const eu = () => GC.usuarioAtual();
  const area = (id) => (GC.data.areas || []).find((a) => a.id === id) || { nome: id, secretaria: { nome: id } };
  const nomeSecretaria = (id) => area(id).secretaria.nome;
  const primeiroNome = (n) => String(n || '').replace(/^(Guarda|Inspetor|Inspetora)\s+/, '').split(' ')[0];
  const dataHora = (ms) => new Date(ms).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
  // O texto do tempo ("3 h", "2 dias") vem da store no painel; aqui a página não carrega a store.
  if (!GC.tempoTexto) GC.tempoTexto = (min) => (min < 60 ? `${Math.round(min)} min` : min < 2880 ? `${Math.round(min / 60)} h` : `${Math.round(min / 1440)} dias`);

  // Tema: o salvo (js/tema.js, o mesmo do painel); sem escolha, o do aparelho.
  try {
    if (!localStorage.getItem('vd-mapa-tema') && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) GC.aplicarTemaInterface('escuro');
  } catch (e) { /* sem armazenamento */ }
  if (GC.personalizacao) GC.personalizacao.aplicar();
  if (GC.cidade && $('cidade-nome') && !$('cidade-nome').textContent.trim()) $('cidade-nome').textContent = GC.cidade.nome;
  document.title = `${GC.cidade ? GC.cidade.nome : 'Vila Dourada'} · Portal do servidor`;

  // ---------- Demonstração: demandas de exemplo ----------
  // Sem login, o servidor que abre o portal pela primeira vez recebe três demandas do secretário da pasta: uma cobrada,
  // uma com notícia pedida e uma nova. Uma vez por servidor e cidade; vão ao mesmo registro (o painel vê).
  // Cada exemplo: [o que fazer, onde, mais detalhes].
  const EXEMPLOS = {
    infraestrutura: [
      ['Trocar a tampa quebrada do bueiro da Rua das Flores', 'Rua das Flores, 120, em frente à padaria', 'A tampa rachou e um morador quase caiu. Levar tampa de 60 cm e isolar a área até terminar.'],
      ['Tapar os buracos da Avenida Central entre os números 200 e 450', 'Avenida Central, do 200 ao 450', 'São 6 buracos na faixa da direita. Usar massa asfáltica fria; o trânsito já foi avisado.'],
      ['Vistoriar a iluminação da praça da Vila Nova', 'Praça da Vila Nova', 'Moradores dizem que metade dos postes está apagada. Anotar o número de cada poste com defeito.'],
    ],
    defesa_civil: [
      ['Vistoriar as casas da encosta do Morro do Sol antes da chuva', 'Encosta do Morro do Sol, ruas A a D', 'Procurar rachaduras novas e muros inclinados. Previsão de 60 mm até sexta.'],
      ['Conferir os kits do abrigo do ginásio municipal', 'Ginásio municipal', 'Contar colchões, cobertores e kits de higiene. O mínimo é 80 de cada.'],
      ['Atualizar o cadastro das famílias da margem do córrego', 'Margem do córrego, trecho da ponte velha', 'Confirmar telefone e quantas pessoas moram em cada casa.'],
    ],
    saude: [
      ['Visitar as gestantes da área 3 que faltaram ao pré-natal', 'Área 3 da UBS Central', 'São 4 gestantes. A lista com os endereços está com a enfermeira-chefe.'],
      ['Conferir o estoque de vacinas da UBS Central', 'UBS Central, sala de vacinas', 'Conferir validade e temperatura da geladeira. Avisar se faltar alguma dose.'],
      ['Mutirão de busca de focos de dengue na Vila Nova', 'Vila Nova, quadras 1 a 12', 'Levar larvicida e o formulário de visita. Foco achado vai para a planilha da vigilância.'],
    ],
    educacao: [
      ['Levantar os alunos com mais de 5 faltas no mês na EM Centro', 'EM Centro, secretaria da escola', 'Separar por turma e anotar se a família já foi avisada.'],
      ['Conferir a entrega da merenda da semana', 'Depósito da merenda escolar', 'Conferir a nota com o que chegou, item por item.'],
      ['Organizar a reunião de pais do 5º ano', 'EM Centro, auditório', 'Reunião na quinta às 19h. Preparar a lista de presença e o projetor.'],
    ],
    seguranca: [
      ['Reforçar a ronda na saída das escolas do Centro', 'Escolas do Centro', 'Das 11h30 às 12h30 e das 17h às 18h, por uma semana.'],
      ['Revisar as câmeras sem imagem da Praça da Matriz', 'Praça da Matriz', 'São 3 câmeras sem imagem desde segunda. Verificar a energia e o cabo.'],
      ['Acompanhar a feira de domingo no Jardim das Flores', 'Feira do Jardim das Flores', 'Das 6h às 13h. Ponto de apoio na barraca da associação.'],
    ],
    mobilidade: [
      ['Sinalizar o desvio da obra na Avenida Central', 'Avenida Central com a Rua 7', 'Cones e placas de desvio antes das 7h. A obra começa às 8h.'],
      ['Conferir o semáforo apagado da Rua XV com a Rua 7', 'Rua XV com a Rua 7', 'Se for queda de energia, avisar a concessionária e pôr um agente no cruzamento.'],
      ['Contar os passageiros da linha 12 no horário de pico', 'Linha 12, ponto final do Centro', 'Contar das 6h às 8h e das 17h às 19h, por viagem.'],
    ],
    limpeza: [
      ['Recolher o entulho deixado na esquina da Rua das Palmeiras', 'Rua das Palmeiras com a Rua 3', 'Cerca de 2 m³ de entulho de obra. Precisa do caminhão basculante.'],
      ['Refazer a rota da coleta do Bela Vista que atrasou', 'Bela Vista, rota 4', 'As ruas 10 a 18 ficaram sem coleta ontem.'],
      ['Fazer a varrição extra no entorno da feira de sábado', 'Entorno da feira de sábado', 'Começar logo depois que as barracas saírem, por volta das 14h.'],
    ],
  };
  const PADRAO_EXEMPLOS = [
    ['Conferir o atendimento da unidade', 'Unidade da secretaria', ''],
    ['Levantar o que falta de material', 'Almoxarifado da secretaria', ''],
    ['Organizar a escala da semana', 'Unidade da secretaria', ''],
  ];
  // O bairro do exemplo: o que aparece no texto, senão um da cidade (as três cidades têm bairros diferentes).
  const bairroDoExemplo = (texto, i) => {
    const bs = (GC.data && GC.data.bairros) || [];
    const achado = bs.find((b) => texto.toLowerCase().includes(b.nome.toLowerCase()));
    return achado ? achado.id : bs.length ? bs[(i * 3 + 1) % bs.length].id : null;
  };
  function semearExemplos() {
    const u = eu();
    if (!u || GC.loginExigido) return;
    const chave = `gc.servidorExemplo.${GC.cidade ? GC.cidade.id : 'media'}.${u.id}`;
    try { if (localStorage.getItem(chave)) return; localStorage.setItem(chave, '1'); } catch (e) { return; }
    if (reg.lista().some((t) => t.responsavelId === u.id)) return;
    const sec = GC.usuarioDoPerfil({ id: 'setor', area: u.area });
    const quem = { id: sec ? sec.id : null, nome: sec ? sec.nome : 'Secretaria', area: u.area };
    const eu2 = { id: u.id, nome: u.nome, area: u.area };
    const textos = EXEMPLOS[u.area] || PADRAO_EXEMPLOS;
    const passar = ([texto, onde, detalhe], prazoMin, i) => reg.passar({
      texto, area: u.area, responsavelId: u.id, prazoEm: agora() + prazoMin * MIN, contexto: { tipo: 'avulsa' },
      local: { texto: onde, bairroId: bairroDoExemplo(`${texto} ${onde}`, i) }, detalhe,
    }, quem);
    const a = passar(textos[0], 3 * 60, 0);
    if (a.ok) reg.cobrar(a.tarefa.id, quem);
    const b = passar(textos[1], 3 * 1440, 1);
    if (b.ok) { reg.iniciar(b.tarefa.id, eu2); reg.atualizar(b.tarefa.id, 'Material separado. A equipe começa amanhã cedo.', eu2); reg.pedirAtualizacao(b.tarefa.id, quem); }
    passar(textos[2], 7 * 1440, 2);
  }
  semearExemplos();

  // ---------- Ações ----------
  const AUDITORIA = { iniciar: 'tarefa_iniciar', concluir: 'tarefa_concluir', responder: 'tarefa_responder', atualizar: 'tarefa_atualizar', duvidar: 'tarefa_duvida' };
  const AVISO = { iniciar: 'Demanda começada.', concluir: 'Demanda concluída. Quem passou já vê.', responder: 'Resposta enviada.', atualizar: 'Notícia enviada.', duvidar: 'Dúvida enviada. A resposta aparece na sua fila.' };
  function agir(acao, id, texto) {
    const t = reg.buscar(id);
    const u = eu();
    if (!t || !u) return { ok: false, motivo: 'nao_encontrada' };
    if (!AUDITORIA[acao] || !GC.podeNaTarefa(acao, t, perfil, u)) return { ok: false, motivo: 'permissao' };
    const quem = { id: u.id, nome: u.nome, area: u.area };
    const r = {
      iniciar: () => reg.iniciar(id, quem),
      concluir: () => reg.concluir(id, texto, quem),
      responder: () => reg.responder(id, texto, quem),
      atualizar: () => reg.atualizar(id, texto, quem),
      duvidar: () => reg.duvidar(id, texto, quem),
    }[acao]();
    if (r.ok && GC.auditar) GC.auditar(AUDITORIA[acao], { alvo: t.texto, areaAlvo: t.area, detalhe: texto || '', ref: { tipo: 'tarefa', id: t.id } });
    if (r.ok) aviso(AVISO[acao]);
    return r;
  }

  // Gestos na sala de crise. Quem pode: GC.podeNoGabinete (só a demanda passada à pessoa, a questão apontada a ela
  // ou à pasta dela, e atualizar e perguntar na sala em que é membro). Auditoria crise_*.
  const AUDITORIA_SALA = { avancar: 'crise_avancar', responder: 'crise_responder', questao: 'crise_questao', atualizar: 'crise_atualizacao', duvidar: 'crise_duvida' };
  const AVISO_SALA = { responder: 'Resposta enviada à sala.', questao: 'Resposta registrada na sala.', atualizar: 'Atualização enviada à sala.', duvidar: 'Dúvida enviada. A resposta aparece na sua fila.' };
  function agirSala(acao, gid, alvoId, texto) {
    gabinetes.recarregar();
    const g = gabinetes.buscar(gid);
    const u = eu();
    if (!g || !u || !AUDITORIA_SALA[acao]) return { ok: false, motivo: 'estado' };
    const quem = { id: u.id, nome: u.nome, area: u.area };
    const t = acao === 'avancar' || acao === 'responder' ? g.tarefas.find((x) => x.id === alvoId) : null;
    const q = acao === 'questao' ? (g.perguntas || []).find((x) => x.id === alvoId) : null;
    const alvo = t || q || null;
    if (!GC.podeNoGabinete(acao, g, alvo, perfil, u)) return { ok: false, motivo: 'permissao' };
    const limpo = String(texto || '').trim();
    if (acao !== 'avancar' && !limpo) return { ok: false, motivo: acao === 'duvidar' ? 'duvida' : acao === 'atualizar' ? 'atualizacao' : 'resposta' };
    const ok = {
      avancar: () => gabinetes.avancarTarefa(gid, alvoId, quem),
      responder: () => gabinetes.responderCobranca(gid, alvoId, limpo, u.nome),
      questao: () => gabinetes.responderPergunta(gid, alvoId, limpo, u.nome),
      atualizar: () => !!gabinetes.enviarAtualizacao(gid, limpo, quem),
      duvidar: () => !!gabinetes.perguntarASala(gid, limpo, quem),
    }[acao]();
    if (!ok) return { ok: false, motivo: 'estado' };
    const detalhe = acao === 'avancar' ? (g.tarefas.find((x) => x.id === alvoId).status === 'concluida' ? 'concluída' : 'iniciada') : limpo;
    if (GC.auditar) GC.auditar(AUDITORIA_SALA[acao], { alvo: alvo ? alvo.texto : g.titulo, areaAlvo: u.area, detalhe: `${g.titulo} · ${detalhe}`, ref: { tipo: 'gabinete', id: gid } });
    aviso(acao === 'avancar' ? (detalhe === 'concluída' ? 'Demanda concluída. A sala já vê.' : 'Demanda iniciada.') : AVISO_SALA[acao]);
    return { ok: true };
  }

  let avisoT = null;
  function aviso(texto) {
    const el = $('sv-aviso');
    el.textContent = texto;
    el.hidden = false;
    clearTimeout(avisoT);
    avisoT = setTimeout(() => { el.hidden = true; }, 3500);
  }

  // ---------- Pedaços de HTML ----------
  const minhas = () => GC.tarefasVisiveis(reg.lista(), perfil, eu());
  const situacao = (t) => {
    if (t.status === 'feita') return ['feita', 'Feita'];
    if (t.status === 'cancelada') return ['cancelada', 'Cancelada'];
    if (t.respostaPendente) return ['cobrada', 'Cobrada'];
    if (GC.tarefaAtrasada(t)) return ['atrasada', 'Atrasada'];
    return [t.status, GC.STATUS_TAREFA[t.status]];
  };
  const urgencia = (t) => {
    if (!GC.tarefaAberta(t)) return 'fechada';
    if (agora() > t.prazoEm) return 'atrasada';
    return t.prazoEm - agora() <= DIA ? 'hoje' : 'depois';
  };
  const contexto = (t) => (t.contexto && t.contexto.tipo !== 'avulsa' ? `${GC.CONTEXTOS_TAREFA[t.contexto.tipo].nome}: ${t.contexto.nome}` : '');
  // "hoje às 17:02", "amanhã às 08:00" ou "sex, 20/11 às 17:02".
  function quando(ms) {
    const d = new Date(ms);
    const hoje = new Date(agora()); hoje.setHours(0, 0, 0, 0);
    const dias = Math.round((new Date(ms).setHours(0, 0, 0, 0) - hoje.getTime()) / DIA);
    const h = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    if (dias === 0) return `hoje às ${h}`;
    if (dias === 1) return `amanhã às ${h}`;
    if (dias === -1) return `ontem às ${h}`;
    const sem = d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '');
    return `${sem}, ${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} às ${h}`;
  }
  // Onde é a demanda: o local escrito por quem passou ou, se está ligada a um alerta, o lugar da ocorrência.
  // coords = [lat, lng] (o mapa da cidade fictícia usa coordenadas reais).
  function ondeDe(t) {
    const bairros = (GC.data && GC.data.bairros) || [];
    const bairro = (id) => bairros.find((b) => b.id === id);
    if (t.local) {
      const b = bairro(t.local.bairroId);
      return { texto: t.local.texto, bairro: b ? b.nome : '', coords: b ? b.centro : null };
    }
    if (t.contexto && t.contexto.tipo === 'alerta') {
      const o = [...(GC.data.ocorrencias || []), ...(GC.data.ocorrenciasExtras || [])].find((x) => x.id === t.contexto.id);
      if (o) {
        const b = bairro(o.bairroId);
        return { texto: o.titulo, bairro: b ? b.nome : '', coords: o.lat != null ? [o.lat, o.lng] : b ? b.centro : null };
      }
    }
    return null;
  }

  function cartao(t, tipo, extra = {}) {
    const [sit, rotulo] = situacao(t);
    const def = tipo ? GC.TIPOS_FILA_SERVIDOR[tipo] : null;
    return `<li><a class="sv-cartao ${tipo || sit}${extra.urgente ? ' urgente' : ''}" href="#/demandas/${esc(t.id)}"${extra.atual ? ' aria-current="true"' : ''}>
        <span class="sv-cartao-topo">
          ${def ? `<span class="sv-tipo ${tipo}">${ic(def.icone)} ${esc(def.rotulo)}</span>` : `<span class="sv-sit ${sit}">${esc(rotulo)}</span>`}
          <span class="sv-prazo ${urgencia(t)}">${ic(urgencia(t) === 'atrasada' ? 'alert-triangle' : 'clock')} ${esc(GC.prazoTarefaTexto(t))}</span>
        </span>
        <b class="sv-cartao-texto">${esc(t.texto)}</b>
        <span class="sv-cartao-meta">${t.criadaPor && t.criadaPor.nome ? `Passada por ${esc(t.criadaPor.nome)}` : esc(nomeSecretaria(t.area))}${contexto(t) ? ` · ${esc(contexto(t))}` : ''}${t.duvida ? ` · ${ic('help-circle')} dúvida esperando resposta` : ''}</span>
        ${def ? `<span class="sv-passo">${esc(def.passo)} ${ic('arrow-right')}</span>` : ''}
      </a></li>`;
  }

  // Item da fila que vem de uma sala de crise: leva à sala (#/sala/<id>), ao ponto certo dela.
  const hora = (ms) => new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const tempoAte = (ms) => (ms > agora() ? `faltam ${GC.tempoTexto(Math.max(1, Math.round((ms - agora()) / MIN)))}` : `atrasada há ${GC.tempoTexto(Math.max(1, Math.round((agora() - ms) / MIN)))}`);
  function cartaoSala(x, extra = {}) {
    const def = GC.TIPOS_FILA_SERVIDOR[x.tipo];
    const g = x.gabinete;
    const texto = x.questao ? x.questao.texto : x.tarefaSala ? x.tarefaSala.texto : x.duvida ? x.duvida.texto : g.titulo;
    const membro = (g.membros || []).find((m) => m.usuarioId === (eu() || {}).id && !m.saiuEm);
    const meta = x.questao ? (x.questao.para && x.questao.para.usuarioId ? 'Questão para você' : 'Questão para a sua pasta')
      : x.tarefaSala ? tempoAte(x.prazoEm) : x.duvida ? `Resposta: ${x.duvida.resposta}`
        : membro ? `${membro.chamadoPor} chamou você às ${hora(membro.chamadoEm)}` : `Aberto às ${hora(g.abertoEm)}`;
    const texto2 = x.tipo === 'chamado_gabinete' ? 'Veja o que a sala espera de você' : texto;
    const ancora = x.questao ? `/q-${x.questao.id}` : x.tarefaSala ? `/t-${x.tarefaSala.id}` : '';
    return `<li><a class="sv-cartao ${x.tipo} sala${extra.urgente ? ' urgente' : ''}" href="#/sala/${esc(g.id)}${esc(ancora)}">
        <span class="sv-cartao-topo"><span class="sv-tipo ${x.tipo}">${ic(def.icone)} ${esc(def.rotulo)}</span><span class="sv-sala-nome">${ic('urgent')} ${esc(g.titulo)}</span></span>
        <b class="sv-cartao-texto">${esc(texto2)}</b>
        <span class="sv-cartao-meta">${esc(meta)}</span>
        <span class="sv-passo">${esc(def.passo)} ${ic('arrow-right')}</span>
      </a></li>`;
  }
  const filaAgora = () => GC.filaDoServidor({ tarefas: reg.lista(), gabinetes: gabinetes.todos(), usuario: eu(), agora: agora() });

  // ---------- Telas ----------
  function telaFila() {
    const u = eu();
    const f = filaAgora();
    const h = new Date(agora()).getHours();
    const ola = h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
    const equipe = u && u.equipeId && GC.nomeEquipe ? GC.nomeEquipe(u.equipeId) : '';
    // A fila em três grupos pelo tempo: o que não pode esperar, o que vence até o fim do dia e o resto.
    const grupos = { agora: [], hoje: [], depois: [] };
    f.itens.forEach((x) => grupos[grupoDoItem(x)].push(x));
    const resumo = [
      [grupos.agora.length, 'urgente', 'urgentes', 'ruim'],
      [grupos.hoje.length, 'para hoje', 'para hoje', 'atencao'],
      [grupos.depois.length, 'nos próximos dias', 'nos próximos dias', ''],
      [f.esperandoResposta, 'dúvida esperando resposta', 'dúvidas esperando resposta', ''],
      [f.feitasSemana, 'feita na semana', 'feitas na semana', 'bom'],
    ].filter(([n]) => n);
    const frase = grupos.agora.length
      ? `Você tem ${plural(grupos.agora.length, 'coisa que não pode esperar', 'coisas que não podem esperar')}.`
      : f.itens.length ? 'Nada urgente agora.' : '';
    const bloco = (id, titulo, sub, itens) => (itens.length ? `<section class="sv-grupo sv-grupo-${id}" aria-labelledby="sv-g-${id}">
          <h2 class="sv-h2" id="sv-g-${id}">${esc(titulo)} <span class="sv-h2-num">${itens.length}</span></h2>${sub ? `<p class="sv-grupo-sub">${esc(sub)}</p>` : ''}
          <ul class="sv-lista">${itens.map((x) => (x.gabinete ? cartaoSala(x, { urgente: id === 'agora' }) : cartao(x.tarefa, x.tipo, { urgente: id === 'agora' }))).join('')}</ul>
        </section>` : '');
    return `<section class="sv-sec sv-fila" aria-labelledby="sv-t-fila">
        <p class="sv-ola">${esc(ola)}, ${esc(primeiroNome(u ? u.nome : ''))}.${frase ? ` <b>${esc(frase)}</b>` : ''}</p>
        <h1 id="sv-t-fila">Minha fila</h1>
        <p class="sv-sub">${esc([u && u.unidade, equipe, nomeSecretaria(perfil.area)].filter(Boolean).join(' · '))}</p>
        ${resumo.length ? `<ul class="sv-numeros">${resumo.map(([n, um, varios, cls]) => `<li class="${cls}"><b>${n}</b> ${esc(n === 1 ? um : varios)}</li>`).join('')}</ul>` : ''}
        ${f.salas.length ? `<ul class="sv-salas">${f.salas.map((g) => `<li><a href="#/sala/${esc(g.id)}" class="sv-sala-faixa">${ic('urgent')}<span><b>Você está na sala de crise</b> ${esc(g.titulo)}</span>${ic('arrow-right')}</a></li>`).join('')}</ul>` : ''}
        ${f.itens.length
          ? `${bloco('agora', 'Agora', 'Cobranças, atrasos e a sala de crise', grupos.agora)}${bloco('hoje', 'Hoje', 'O que vence hoje e as notícias pedidas', grupos.hoje)}${bloco('depois', 'Próximos dias', '', grupos.depois)}`
          : `<div class="sv-vazio">${ic('mood-check')}<p><b>Nada esperando por você agora.</b></p><p>${f.abertas ? `Suas ${plural(f.abertas, 'demanda aberta está', 'demandas abertas estão')} em dia. <a href="#/demandas">Ver as demandas</a>` : 'Quando alguém passar uma demanda para você, ela aparece aqui.'}</p></div>`}
      </section>`;
  }
  // Grupo de um item da fila. "Agora": cobrança, atraso e o que vem da sala de crise (fora as demandas da sala com
  // folga). "Hoje": vence até o fim do dia, notícia pedida, resposta de dúvida e demanda da sala. "Depois": o resto.
  const AGORA_TIPOS = ['cobrada', 'atrasada', 'questao_gabinete', 'chamado_gabinete'];
  const HOJE_TIPOS = ['noticia_pedida', 'duvida_respondida', 'sala_demanda'];
  function grupoDoItem(x) {
    if (AGORA_TIPOS.includes(x.tipo)) return 'agora';
    const prazo = x.tarefa ? x.tarefa.prazoEm : x.prazoEm;
    if (prazo && prazo < agora()) return 'agora';
    if (HOJE_TIPOS.includes(x.tipo)) return 'hoje';
    const fimDoDia = new Date(agora()); fimDoDia.setHours(23, 59, 59, 999);
    return prazo && prazo <= fimDoDia.getTime() ? 'hoje' : 'depois';
  }

  function telaLista(atualId) {
    const todas = minhas();
    const abertas = todas.filter(GC.tarefaAberta).sort((a, b) => a.prazoEm - b.prazoEm);
    const fechadas = todas.filter((t) => !GC.tarefaAberta(t)).sort((a, b) => (b.feitaEm || b.criadaEm) - (a.feitaEm || a.criadaEm));
    return `<section class="sv-sec" aria-labelledby="sv-t-dem">
        <h1 id="sv-t-dem">Demandas</h1>
        <p class="sv-sub">As que foram passadas a você, da que vence primeiro à última.</p>
        ${(() => { const salas = GC.salasDoServidor(gabinetes.todos(), eu()); return salas.length ? `<ul class="sv-salas">${salas.map((g) => `<li><a href="#/sala/${esc(g.id)}" class="sv-sala-faixa">${ic('urgent')}<span><b>As demandas da sala de crise ficam na sala</b> ${esc(g.titulo)}</span>${ic('arrow-right')}</a></li>`).join('')}</ul>` : ''; })()}
        ${abertas.length ? `<ul class="sv-lista">${abertas.map((t) => cartao(t, null, { atual: t.id === atualId })).join('')}</ul>` : `<div class="sv-vazio">${ic('clipboard-check')}<p><b>Nenhuma demanda aberta.</b></p></div>`}
        ${fechadas.length ? `<details class="sv-fechadas"${fechadas.some((t) => t.id === atualId) ? ' open' : ''}><summary>${plural(fechadas.length, 'feita ou cancelada', 'feitas ou canceladas')}</summary><ul class="sv-lista">${fechadas.map((t) => cartao(t, null, { atual: t.id === atualId })).join('')}</ul></details>` : ''}
      </section>`;
  }

  const ICONE_HIST = { atualizacao: 'message-2', duvida: 'help-circle', esclarecimento: 'message-check', pedido: 'bell-ringing' };
  function telaDetalhe(id) {
    const t = minhas().find((x) => x.id === id);
    if (!t) return `<section class="sv-sec"><a class="sv-voltar" href="#/demandas">${ic('arrow-left')} Demandas</a><div class="sv-vazio">${ic('clipboard-x')}<p><b>Essa demanda não está com você.</b></p><p>Ela pode ter sido passada a outra pessoa ou cancelada.</p></div></section>`;
    const u = eu();
    const pode = (acao) => GC.podeNaTarefa(acao, t, perfil, u);
    const aberta = GC.tarefaAberta(t);
    const [sit, rotulo] = situacao(t);
    const avisos = [];
    if (t.respostaPendente) avisos.push(['cobrada', 'speakerphone', `<b>${esc(t.criadaPor && t.criadaPor.nome ? t.criadaPor.nome : 'Quem passou')} cobrou esta demanda.</b> Conte o que está sendo feito e quando fica pronto.`]);
    if (aberta && t.atualizacaoPedidaEm) avisos.push(['noticia', 'bell-ringing', `<b>Pediram notícia</b> ${esc(dataHora(t.atualizacaoPedidaEm))}. Uma linha sobre como está já ajuda.`]);
    if (t.duvida) avisos.push(['duvida', 'help-circle', `<b>Sua dúvida está esperando resposta:</b> ${esc(t.duvida.texto)}`]);
    const resposta = (t.historico || []).filter((h) => h.tipo === 'esclarecimento').pop();
    if (resposta && !t.duvida) avisos.push(['resposta', 'message-check', `<b>Resposta${resposta.quem ? ` de ${esc(resposta.quem)}` : ''}:</b> ${esc(resposta.texto.replace(/^Resposta à dúvida: /, ''))}`]);
    // Uma ação principal por estado (cobrada → responder; a fazer → começar; notícia pedida → dar notícia;
    // em andamento → concluir), uma secundária e o resto como links discretos.
    const BOTOES = {
      responder: ['message-reply', 'Responder cobrança'],
      iniciar: ['player-play', 'Começar'],
      atualizar: ['message-2', 'Dar notícia'],
      concluir: ['check', 'Concluir'],
      duvidar: ['help-circle', 'Tenho uma dúvida'],
    };
    const disponiveis = !aberta ? [] : [
      t.respostaPendente && pode('responder') ? 'responder' : null,
      t.status === 'a_fazer' && pode('iniciar') ? 'iniciar' : null,
      pode('atualizar') ? 'atualizar' : null,
      pode('concluir') ? 'concluir' : null,
      pode('duvidar') && !t.duvida ? 'duvidar' : null,
    ].filter(Boolean);
    const tem = (a) => disponiveis.includes(a);
    const principal = (t.respostaPendente && tem('responder') && 'responder') || (tem('iniciar') && 'iniciar')
      || (t.atualizacaoPedidaEm && tem('atualizar') && 'atualizar') || (t.status === 'fazendo' && tem('concluir') && 'concluir')
      || disponiveis.find((a) => a !== 'duvidar') || null;
    const secundaria = ['iniciar', 'atualizar', 'concluir'].find((a) => a !== principal && tem(a)) || null;
    const outras = disponiveis.filter((a) => a !== principal && a !== secundaria);
    const botoes = disponiveis.map((a) => [a, ...BOTOES[a], a === principal]);
    const attrAcao = (a) => `${a === 'iniciar' ? 'data-sv-agir' : 'data-sv-abrir'}="${a}" aria-expanded="false"`;
    const acoesHtml = !disponiveis.length ? '' : `<div class="sv-acoes">
          ${principal ? `<button type="button" class="sv-btn sv-btn-principal" ${attrAcao(principal)}>${ic(BOTOES[principal][0])} ${esc(BOTOES[principal][1])}</button>` : ''}
          ${secundaria ? `<button type="button" class="sv-btn sec" ${attrAcao(secundaria)}>${ic(BOTOES[secundaria][0])} ${esc(BOTOES[secundaria][1])}</button>` : ''}
          ${outras.length ? `<div class="sv-mais">${outras.map((a) => `<button type="button" class="sv-link" ${attrAcao(a)}>${ic(BOTOES[a][0])} ${esc(BOTOES[a][1])}</button>`).join('')}</div>` : ''}
        </div>`;
    const onde = ondeDe(t);
    const FORMS = {
      responder: ['Responder à cobrança', 'O que está sendo feito e quando fica pronto', 'Ex.: a equipe está na rua; termina na sexta', 'Enviar resposta'],
      atualizar: ['Dar notícia', 'Como está a demanda', 'Ex.: metade feita; o resto amanhã de manhã', 'Enviar notícia'],
      duvidar: ['Tenho uma dúvida', `Sua pergunta para ${t.criadaPor && t.criadaPor.nome ? t.criadaPor.nome : 'quem passou'}`, 'Ex.: posso usar o material do almoxarifado central?', 'Enviar dúvida'],
      concluir: ['Concluir a demanda', 'O que foi feito', 'Ex.: 3 bueiros trocados; foto no grupo da equipe', 'Marcar como feita'],
    };
    const forms = Object.entries(FORMS).filter(([a]) => botoes.some((b) => b[0] === a)).map(([a, [tit, rot, ph, ok]]) => `
        <form class="sv-form" data-sv-form="${a}" hidden>
          <h3>${esc(tit)}</h3>
          <label class="sv-campo">${esc(rot)}<textarea name="texto" rows="3" maxlength="${GC.LIMITES_TAREFA.resposta}" placeholder="${esc(ph)}" required></textarea></label>
          <p class="sv-erro" role="alert"></p>
          <div class="sv-form-pe"><button type="submit" class="sv-btn">${esc(ok)}</button><button type="button" class="sv-btn sec" data-sv-fechar>Voltar</button></div>
        </form>`).join('');
    const hist = (t.historico || []).slice().reverse();
    return `<section class="sv-sec sv-detalhe" aria-labelledby="sv-t-det" data-sv-id="${esc(t.id)}">
        <a class="sv-voltar" href="#/demandas">${ic('arrow-left')} Demandas</a>
        <div class="sv-det-topo"><span class="sv-sit ${sit}">${esc(rotulo)}</span>${contexto(t) ? `<span class="sv-ligada">${ic(GC.CONTEXTOS_TAREFA[t.contexto.tipo].icone)} ${esc(contexto(t))}</span>` : ''}</div>
        <h1 id="sv-t-det">${esc(t.texto)}</h1>
        <p class="sv-quando">${aberta ? `<span class="sv-prazo ${urgencia(t)}">${ic(urgencia(t) === 'atrasada' ? 'alert-triangle' : 'clock')} ${esc(GC.prazoTarefaTexto(t))}</span> <span>· ${esc(quando(t.prazoEm))}</span>` : `<span>Prazo era ${esc(quando(t.prazoEm))}</span>`}</p>
        ${avisos.map(([cls, icone, html]) => `<p class="sv-aviso-linha ${cls}">${ic(icone)}<span>${html}</span></p>`).join('')}
        ${t.status === 'feita' && t.evidencia ? `<p class="sv-aviso-linha feita">${ic('check')}<span><b>Feita:</b> ${esc(t.evidencia)}</span></p>` : ''}
        ${acoesHtml}
        ${forms}
        ${onde ? `<div class="sv-onde">
          <span class="sv-onde-ic">${ic('map-pin')}</span>
          <div><span class="sv-rotulo">Onde</span><b>${esc(onde.texto || onde.bairro)}</b>${onde.bairro && onde.texto ? `<small>${esc(onde.bairro)}</small>` : ''}</div>
          ${onde.coords ? `<a class="sv-btn sec sv-chegar" href="https://www.google.com/maps/dir/?api=1&amp;destination=${onde.coords[0].toFixed(5)},${onde.coords[1].toFixed(5)}" target="_blank" rel="noopener">${ic('route')} Como chegar</a>` : ''}
        </div>` : ''}
        ${t.detalhe ? `<div class="sv-oque"><span class="sv-rotulo">O que fazer</span><p>${esc(t.detalhe)}</p></div>` : ''}
        <p class="sv-passada">${ic('user')} Passada por <b>${esc(t.criadaPor && t.criadaPor.nome ? t.criadaPor.nome : nomeSecretaria(t.area))}</b> em ${esc(dataHora(t.criadaEm))}</p>
        ${hist.length ? `<h2 class="sv-h2">Histórico</h2><ol class="sv-hist">${hist.map((x) => `<li class="${esc(x.tipo || '')}">${ic(ICONE_HIST[x.tipo] || 'point')}<div><span>${esc(dataHora(x.t))}${x.quem ? ` · ${esc(x.quem)}` : ''}</span><p>${esc(x.texto)}</p></div></li>`).join('')}</ol>` : ''}
      </section>`;
  }

  // ---------- Sala de crise (versão enxuta: só o que é da pessoa; nada de cobrar, convocar, comunicar ou encerrar) ----------
  const STATUS_SALA = { a_fazer: 'A fazer', em_andamento: 'Em andamento', concluida: 'Concluída', cancelada: 'Cancelada' };
  const PROXIMO_SALA = { a_fazer: ['player-play', 'Começar'], em_andamento: ['check', 'Concluir'] };
  function telaSala(gid) {
    const u = eu();
    const g = gabinetes.buscar(gid);
    if (!g || !GC.podeNoGabinete('ver', g, null, perfil, u)) {
      return `<section class="sv-sec"><a class="sv-voltar" href="#/">${ic('arrow-left')} Minha fila</a><div class="sv-vazio">${ic('door-off')}<p><b>Você não está nesta sala de crise.</b></p><p>Ela pode ter sido encerrada, ou você saiu dela.</p></div></section>`;
    }
    const r = gabinetes.resumo(gid);
    const m = (g.membros || []).find((x) => x.usuarioId === u.id && !x.saiuEm);
    const minhas = r.tarefas.filter((t) => t.responsavelId === u.id);
    const daPasta = r.tarefas.filter((t) => t.area === u.area && !t.responsavelId && t.status !== 'cancelada');
    const questoes = GC.questoesParaServidor(g, u);
    const minhasDuvidas = (g.duvidas || []).filter((d) => d.usuarioId === u.id).slice().reverse();
    const ultimo = r.ultimoComunicado;
    const prazo = (t) => (t.status === 'concluida' ? `concluída às ${hora(t.concluidaEm)}` : t.atrasada ? `atrasada há ${GC.tempoTexto(-t.restanteMin)}` : `faltam ${GC.tempoTexto(Math.max(1, t.restanteMin))}`);
    const form = (acao, alvo, rotulo, ph, botao, extra = '') => `<form class="sv-form sv-form-fixo" data-sv-sala="${acao}"${alvo ? ` data-sv-alvo="${esc(alvo)}"` : ''}>
          <label class="sv-campo">${esc(rotulo)}<textarea name="texto" rows="2" maxlength="300" placeholder="${esc(ph)}" required></textarea></label>${extra}
          <p class="sv-erro" role="alert"></p>
          <div class="sv-form-pe"><button type="submit" class="sv-btn">${esc(botao)}</button></div>
        </form>`;
    const demanda = (t) => {
      const aberta = t.status === 'a_fazer' || t.status === 'em_andamento';
      const prox = PROXIMO_SALA[t.status];
      return `<li class="sv-sala-dem ${t.atrasada ? 'atrasada' : t.status}" id="t-${esc(t.id)}">
          <div class="sv-cartao-topo"><span class="sv-sit ${t.atrasada ? 'atrasada' : t.status === 'em_andamento' ? 'fazendo' : t.status === 'concluida' ? 'feita' : ''}">${esc(t.atrasada ? 'Atrasada' : STATUS_SALA[t.status])}</span><span class="sv-prazo ${t.atrasada ? 'atrasada' : ''}">${ic('clock')} ${esc(prazo(t))}</span></div>
          <b class="sv-cartao-texto">${esc(t.texto)}</b>
          ${t.respostaPendente ? `<p class="sv-aviso-linha cobrada">${ic('speakerphone')}<span><b>A sala cobrou esta demanda.</b> Conte o que está sendo feito e quando fica pronto.</span></p>` : ''}
          ${aberta && prox ? `<div class="sv-botoes"><button type="button" class="sv-btn${t.respostaPendente ? ' sec' : ''}" data-sv-sala-agir="avancar" data-sv-alvo="${esc(t.id)}">${ic(prox[0])} ${esc(prox[1])}</button></div>` : ''}
          ${aberta && t.respostaPendente ? form('responder', t.id, 'Resposta à cobrança', 'Ex.: equipe no local; termina em 1 hora', 'Enviar resposta') : ''}
        </li>`;
    };
    const questao = (q) => `<li class="sv-sala-q ${q.resposta ? 'respondida' : 'pendente'}" id="q-${esc(q.id)}">
        <b>${esc(q.texto)}</b> <small class="sv-para">${esc(q.para && q.para.usuarioId ? 'para você' : 'para a sua pasta')}</small>
        ${q.resposta ? `<p class="sv-resposta">${esc(q.resposta)}<small>${q.quem ? `${esc(q.quem)} · ` : ''}às ${hora(q.respondidaEm)}</small></p>` : ''}
        ${g.encerradoEm ? '' : q.resposta
    ? `<details class="sv-mudar"><summary>Mudar a resposta</summary>${form('questao', q.id, 'Nova resposta', 'Ex.: 12 famílias na área; 3 com idosos', 'Salvar')}</details>`
    : form('questao', q.id, 'Sua resposta', 'Ex.: 12 famílias na área; 3 com idosos', 'Responder')}
      </li>`;
    const registro = r.registro.filter((x) => !x.ocorrencia).slice(0, 12);
    return `<section class="sv-sec sv-sala" aria-labelledby="sv-t-sala" data-sv-gid="${esc(g.id)}">
        <a class="sv-voltar" href="#/">${ic('arrow-left')} Minha fila</a>
        <p class="sv-sala-sobre">${g.encerradoEm ? `${ic('circle-check')} Gabinete de crise · encerrado` : `<span class="sv-pulso" aria-hidden="true"></span>Gabinete de crise · ao vivo`}</p>
        <h1 id="sv-t-sala">${esc(g.titulo)}</h1>
        <p class="sv-sub">${esc([g.local && !g.titulo.includes(g.local) ? g.local : null, r.bairro].filter(Boolean).join(' · '))} · aberto há ${esc(GC.tempoTexto(r.abertoHaMin))}${m ? ` · ${esc(m.chamadoPor)} chamou você às ${hora(m.chamadoEm)}` : ''}</p>
        <ul class="sv-numeros"><li><b>${r.feitas}</b> de ${r.total} demandas feitas</li>${r.atrasadas ? `<li class="ruim"><b>${r.atrasadas}</b> ${r.atrasadas === 1 ? 'atrasada' : 'atrasadas'}</li>` : ''}</ul>

        <h2 class="sv-h2">Suas demandas na sala</h2>
        ${minhas.length ? `<ul class="sv-lista">${minhas.map(demanda).join('')}</ul>` : `<p class="sv-nota">${ic('info-circle')} Nenhuma demanda da sala está com você. ${daPasta.length ? `A sua pasta tem ${plural(daPasta.length, 'demanda', 'demandas')} aqui; o secretário passa a quem vai fazer.` : ''}</p>`}

        ${questoes.length ? `<h2 class="sv-h2">A sala pergunta</h2><ul class="sv-lista sv-sala-qs">${questoes.map(questao).join('')}</ul>` : ''}

        ${g.encerradoEm ? '' : `<h2 class="sv-h2">Falar com a sala</h2>
        <div class="sv-sala-falar">
          ${form('atualizar', null, 'Atualização para a sala', 'Ex.: chegamos à encosta; 2 casas com rachadura nova', 'Enviar atualização')}
          ${form('duvidar', null, 'Dúvida para a sala', 'Ex.: removemos as famílias já ou esperamos a vistoria?', 'Perguntar à sala')}
        </div>`}
        ${minhasDuvidas.length ? `<ul class="sv-lista sv-sala-qs">${minhasDuvidas.map((d) => `<li class="sv-sala-q ${d.resposta ? 'respondida' : 'pendente'}"><b>Sua dúvida: ${esc(d.texto)}</b>${d.resposta ? `<p class="sv-resposta">${esc(d.resposta)}<small>${esc(d.respondidaPor || '')} · às ${hora(d.respondidaEm)}</small></p>` : '<p class="sv-nota">Esperando resposta da sala.</p>'}</li>`).join('')}</ul>` : ''}

        ${ultimo ? `<h2 class="sv-h2">O que foi dito à população</h2><blockquote class="sv-comunicado">${esc(ultimo.texto)}<small>Às ${hora(ultimo.t)}</small></blockquote>` : ''}

        <h2 class="sv-h2">Registro da sala</h2>
        <ol class="sv-hist">${registro.map((x) => `<li class="${x.tipo === 'atualizacao' ? 'atualizacao' : ''}">${ic(x.tipo === 'atualizacao' ? 'message-2' : 'point')}<div><span>${hora(x.t)} · ${esc(x.quem)}</span><p>${esc(x.texto)}</p></div></li>`).join('')}</ol>
      </section>`;
  }

  function telaConta() {
    const u = eu();
    if (!u) return '<section class="sv-sec"><h1>Conta</h1><p>Nenhum servidor nesta pasta.</p></section>';
    const escuro = document.documentElement.dataset.tema === 'escuro';
    return `<section class="sv-sec" aria-labelledby="sv-t-conta">
        <h1 id="sv-t-conta">Minha conta</h1>
        <div class="sv-conta-cab"><span class="sv-avatar grande" aria-hidden="true">${esc(u.iniciais || '')}</span><div><b>${esc(u.nome)}</b><span>${esc(u.cargo || '')}</span></div></div>
        <dl class="sv-dados">
          <div><dt>E-mail</dt><dd>${esc(u.email || '')}</dd></div>
          <div><dt>Secretaria</dt><dd>${esc(nomeSecretaria(u.area))}</dd></div>
          ${u.unidade ? `<div><dt>Unidade</dt><dd>${esc(u.unidade)}</dd></div>` : ''}
          ${u.equipeId && GC.nomeEquipe ? `<div><dt>Equipe</dt><dd>${esc(GC.nomeEquipe(u.equipeId))}</dd></div>` : ''}
        </dl>
        <p class="sv-nota">${ic('info-circle')} Aqui ficam só as demandas passadas a você. Quem cuida da pasta e dos números é o painel da gestão.</p>
        <div class="sv-botoes">
          <button type="button" class="sv-btn sec" data-sv-tema>${ic(escuro ? 'sun' : 'moon')} ${escuro ? 'Tema claro' : 'Tema escuro'}</button>
          ${GC.loginExigido ? `<button type="button" class="sv-btn sec" data-sv-sair>${ic('logout')} Sair</button>` : `<button type="button" class="sv-btn sec" data-sv-demo>${ic('presentation')} Demonstração</button>`}
        </div>
      </section>`;
  }

  // ---------- Rota e desenho ----------
  const lerRota = () => {
    const h = (window.location.hash || '').replace(/^#\/?/, '').split('/').filter(Boolean);
    if (h[0] === 'demandas') return { tela: h[1] ? 'detalhe' : 'demandas', id: h[1] ? decodeURIComponent(h[1]) : null };
    if (h[0] === 'conta') return { tela: 'conta' };
    if (h[0] === 'sala' && h[1]) return { tela: 'sala', id: decodeURIComponent(h[1]), ancora: h[2] || null };
    return { tela: 'fila' };
  };
  let pendente = false; // mudou algo com um formulário aberto (ou com texto digitado): redesenha quando ele fechar
  const formAberto = () => !!document.querySelector('.sv-form:not([hidden]):not(.sv-form-fixo)')
    || [...document.querySelectorAll('#sv-conteudo textarea')].some((c) => c.value.trim() || c === document.activeElement);
  let salaVista = null;
  function desenhar(rolarAoTopo, forcar) {
    if (!forcar && formAberto()) { pendente = true; return; }
    pendente = false;
    const r = lerRota();
    const main = $('sv-conteudo');
    // Abriu a sala: o chamado e as respostas até agora deixam de ser novidade na fila (uma vez por entrada na sala).
    if (r.tela === 'sala' && salaVista !== r.id) {
      salaVista = r.id;
      gabinetes.recarregar();
      const u = eu();
      if (u && gabinetes.membroAtivo(r.id, u.id)) gabinetes.marcarVisto(r.id, u.id);
    }
    if (r.tela !== 'sala') salaVista = null;
    // No computador, Demandas mostra a lista e a ficha lado a lado.
    const duas = largo.matches && (r.tela === 'demandas' || r.tela === 'detalhe');
    main.classList.toggle('sv-largo', duas || (largo.matches && r.tela === 'fila'));
    main.innerHTML = duas
      ? `<div class="sv-duas"><div class="sv-col-lista">${telaLista(r.id)}</div><div class="sv-col-det">${r.id ? telaDetalhe(r.id) : `<div class="sv-escolha">${ic('hand-finger-left')}<p><b>Escolha uma demanda</b></p><p>A ficha dela abre aqui.</p></div>`}</div></div>`
      : r.tela === 'detalhe' ? telaDetalhe(r.id) : r.tela === 'demandas' ? telaLista() : r.tela === 'conta' ? telaConta() : r.tela === 'sala' ? telaSala(r.id) : telaFila();
    const aba = r.tela === 'detalhe' ? 'demandas' : r.tela === 'sala' ? 'fila' : r.tela;
    document.querySelectorAll('[data-sv-aba]').forEach((a) => { if (a.dataset.svAba === aba) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    const n = filaAgora().itens.length;
    $('sv-num-fila').textContent = n;
    $('sv-num-fila').hidden = !n;
    // #/sala/<id>/q-<questão> ou /t-<demanda>: vai até ela.
    const alvo = r.tela === 'sala' && r.ancora && rolarAoTopo ? document.getElementById(r.ancora) : null;
    if (alvo) { alvo.scrollIntoView({ block: 'center' }); const c = alvo.querySelector('textarea, button'); if (c) c.focus({ preventScroll: true }); } else if (rolarAoTopo) { window.scrollTo(0, 0); main.focus({ preventScroll: true }); }
    // Rascunho da Maia ("Usar na demanda"): abre "Dar notícia" já com o texto, para a pessoa completar.
    if (rascunho && r.tela === 'detalhe' && r.id === rascunho.tarefaId) {
      const f = main.querySelector('[data-sv-form="atualizar"]');
      const b = main.querySelector('[data-sv-abrir="atualizar"]');
      if (f && b) { b.click(); f.querySelector('textarea').value = rascunho.texto; }
      rascunho = null;
    }
  }
  let rascunho = null;
  const largo = window.matchMedia('(min-width: 1000px)');
  if (largo.addEventListener) largo.addEventListener('change', () => desenhar(false, true));

  // Topo: quem usa.
  const u0 = eu();
  if (u0) {
    $('sv-avatar').textContent = u0.iniciais || '';
    $('sv-eu-nome').textContent = u0.nome;
    $('sv-eu-cargo').textContent = u0.cargo || '';
  }

  window.addEventListener('hashchange', () => desenhar(true, true)); // trocar de tela larga o que estava escrito
  // Outra aba (o painel de quem passou) mudou as demandas: relê e redesenha.
  window.addEventListener('storage', (e) => {
    if (e.key === GC.CHAVE_TAREFAS) reg.recarregar();
    if (e.key === CHAVE_GABINETES) { gabinetes.recarregar(); desenhar(false); } // a sala mudou no painel
  });
  reg.assinar((ev) => { if (ev.tipo === 'recarga') desenhar(false); });
  setInterval(() => desenhar(false), MIN); // os prazos andam

  const main = $('sv-conteudo');
  // Saiu de um campo vazio com novidade esperando: redesenha.
  main.addEventListener('focusout', () => setTimeout(() => { if (pendente && !formAberto()) desenhar(false); }, 0));
  main.addEventListener('click', (e) => {
    const alvo = e.target.closest('[data-sv-abrir], [data-sv-agir], [data-sv-fechar], [data-sv-tema], [data-sv-sair], [data-sv-demo], [data-sv-sala-agir]');
    if (!alvo) return;
    if (alvo.matches('[data-sv-sala-agir]')) {
      const r = agirSala(alvo.dataset.svSalaAgir, alvo.closest('[data-sv-gid]').dataset.svGid, alvo.dataset.svAlvo);
      if (!r.ok) aviso(GC.ERROS_TAREFA[r.motivo] || 'Não deu certo. Tente de novo.');
      desenhar(false);
      return;
    }
    const sec = alvo.closest('[data-sv-id]');
    if (alvo.matches('[data-sv-agir]')) {
      const r = agir(alvo.dataset.svAgir, sec.dataset.svId);
      if (!r.ok) aviso(GC.ERROS_TAREFA[r.motivo] || 'Não deu certo. Tente de novo.');
      desenhar(false);
      return;
    }
    if (alvo.matches('[data-sv-abrir]')) {
      const form = sec.querySelector(`[data-sv-form="${alvo.dataset.svAbrir}"]`);
      const abrir = form.hidden;
      sec.querySelectorAll('.sv-form').forEach((f) => { f.hidden = true; });
      sec.querySelectorAll('[data-sv-abrir]').forEach((b) => b.setAttribute('aria-expanded', 'false'));
      form.hidden = !abrir;
      alvo.setAttribute('aria-expanded', String(abrir));
      if (abrir) { form.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); form.querySelector('textarea').focus({ preventScroll: true }); }
      else if (pendente) desenhar(false);
      return;
    }
    if (alvo.matches('[data-sv-fechar]')) {
      alvo.closest('.sv-form').hidden = true;
      sec.querySelectorAll('[data-sv-abrir]').forEach((b) => b.setAttribute('aria-expanded', 'false'));
      if (pendente) desenhar(false);
      return;
    }
    if (alvo.matches('[data-sv-tema]')) {
      const escuro = document.documentElement.dataset.tema !== 'escuro';
      GC.aplicarTemaInterface(escuro ? 'escuro' : 'claro');
      try { localStorage.setItem('vd-mapa-tema', escuro ? 'escuro' : 'claro'); } catch (er) { /* sem armazenamento */ }
      desenhar(false);
      return;
    }
    if (alvo.matches('[data-sv-sair]')) {
      if (GC.auditar) GC.auditar('sair');
      GC.sessao.sair();
      window.location.href = GC.urlEntrar({ motivo: 'saiu' });
      return;
    }
    if (alvo.matches('[data-sv-demo]')) abrirDemo();
  });
  main.addEventListener('submit', (e) => {
    const form = e.target.closest('.sv-form');
    if (!form) return;
    e.preventDefault();
    if (form.dataset.svSala) {
      const campo = form.querySelector('textarea');
      const r = agirSala(form.dataset.svSala, form.closest('[data-sv-gid]').dataset.svGid, form.dataset.svAlvo, campo.value);
      if (!r.ok) { form.querySelector('.sv-erro').textContent = GC.ERROS_TAREFA[r.motivo] || 'Não deu certo. Tente de novo.'; return; }
      campo.value = '';
      campo.blur();
      desenhar(false);
      return;
    }
    const sec = form.closest('[data-sv-id]');
    const r = agir(form.dataset.svForm, sec.dataset.svId, form.querySelector('textarea').value);
    if (!r.ok) { form.querySelector('.sv-erro').textContent = GC.ERROS_TAREFA[r.motivo] || 'Não deu certo. Tente de novo.'; return; }
    form.hidden = true;
    desenhar(false);
  });

  // ---------- Demonstração ----------
  function abrirDemo() {
    const sel = $('sv-sel-servidor');
    const atual = eu();
    sel.innerHTML = (GC.data.areas || []).map((a) => {
      const us = GC.data.usuarios.filter((u) => u.perfil === 'servidor' && u.area === a.id && u.ativo !== false);
      return us.length ? `<optgroup label="${esc(a.secretaria.nome)}">${us.map((u) => `<option value="${esc(u.id)}"${atual && u.id === atual.id ? ' selected' : ''}>${esc(`${u.nome} · ${u.cargo}`)}</option>`).join('')}</optgroup>` : '';
    }).join('');
    $('sv-dlg-demo').showModal();
  }
  $('sv-dlg-demo').addEventListener('close', () => {
    const v = $('sv-dlg-demo').returnValue;
    const u = GC.buscarUsuario($('sv-sel-servidor').value);
    if (v === 'ok' && u) GC.escolherPerfil('servidor', u.area, u.id);
    // No painel, a pasta de quem passa as demandas (o secretário dela).
    if (v === 'painel') GC.escolherPerfil('setor', (u || eu() || {}).area || perfil.area);
  });

  // ---------- Maia (js/servidor/maia.js) ----------
  if (GC.criarMaiaServidor) {
    GC.criarMaiaServidor({
      $, esc, ic,
      dados: () => ({ fila: filaAgora(), tarefas: minhas(), usuario: eu(), agora: agora() }),
      usarRascunho: (tarefaId, texto) => {
        rascunho = { tarefaId, texto };
        const destino = `#/demandas/${tarefaId}`;
        if (window.location.hash === destino) desenhar(false, true); else window.location.hash = destino;
      },
    });
  }

  desenhar(false);
})(window.GC = window.GC || {});
