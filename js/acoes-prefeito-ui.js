(function (GC) {
  // Telas das ações do gabinete sobre uma ocorrência (regras em js/acoes-prefeito.js; spec:
  // docs/specs/2026-11-13-vila-dourada-acoes-do-prefeito-2-design.md). Para não poluir o detalhe:
  // - uma barra só, fixa no pé do detalhe (GC.htmlBarraAcoes): a ação recomendada como botão e "Mais ações", um menu
  //   em quatro grupos (Cobrar e decidir, Encaminhar, Comunicar, Encerrar) com só o que vale agora;
  // - um formulário por vez, aberto logo acima da barra;
  // - acompanhar é a estrela do topo do detalhe (GC.htmlEstrelaAcompanhar), pessoal;
  // - o bloco "Decisões do prefeito" (GC.htmlBlocoAcoesPrefeito) só conta o que aconteceu: em curso em cima, o resto
  //   recolhido em "Histórico".
  // Botões: data-ap (ação direta), data-ap-form (abre o formulário), data-acao (cobrar, priorizar, gabinete: da store).
  const esc = (t) => GC.escaparHtml(t);
  const MIN = 60000;
  const sec = (id) => (GC.data.areas.find((a) => a.id === id) || { secretaria: { nome: id } }).secretaria.nome;
  const bairro = (id) => GC.data.bairros.find((b) => b.id === id) || { nome: id };
  const ha = (t) => { const min = Math.round((GC.agora() - t) / MIN); return min < 1 ? 'agora' : `há ${GC.tempoTexto(min)}`; };
  const pode = (acao, alvo) => GC.podeNaAcaoPrefeito && GC.podeNaAcaoPrefeito(acao, alvo);
  const reg = () => GC.acoesPrefeito;
  const ROTULO_HORAS = { 2: '2 h', 6: '6 h', 24: '1 dia', 72: '3 dias' };
  const ROTULO_DIAS = { 1: '1 dia', 3: '3 dias', 7: '1 semana' };
  const usuario = () => (GC.usuarioAtual ? GC.usuarioAtual() : null);

  GC.ERROS_ACAO_PREFEITO = {
    para: 'Escolha a pessoa ou a pasta.', texto: 'Escreva o texto.', motivo: 'Escolha o motivo.', horas: 'Escolha até quando.',
    orgao: 'Escolha o órgão.', nome_orgao: 'Diga qual é o órgão.', dias: 'Escolha o prazo do retorno.', forma: 'Escolha visita ou conversa.',
    quando: 'Escolha um horário que ainda não passou.', usuario: 'Entre com um usuário para acompanhar.',
    ja_existe: 'Já há uma em andamento. Veja em "Decisões do prefeito".', estado: 'Isto já mudou. Veja o histórico.', ocorrencia: 'Não vale para esta ocorrência agora.',
    permissao: 'Não é do seu papel.', confirmar: 'Confirme na janela que abriu.',
  };

  // ---------- registros (bloco "Decisões do prefeito" e aba Cobranças) ----------
  function selo(r) {
    const ap = reg();
    const s = (classe, texto) => `<span class="cb-selo ${classe}">${texto}</span>`;
    if (ap.vencida(r)) return s('vencida', 'Sem resposta');
    const MAPA = {
      delegacao: { ativa: ['espera', 'Delegada'], concluida: ['ok', 'Com retorno'], retomada: ['andamento', 'Retomada'], encerrada: ['andamento', 'Encerrada'] },
      explicacao: { aberta: ['aberta', 'Aguardando'], respondida: ['espera', 'Respondida'], encerrada: ['ok', 'Lida'] },
      adiamento: { ativo: ['andamento', 'Adiada'], retomado: ['andamento', 'Desfeito'] },
      orgao: { aguardando: ['aberta', 'Aguardando'], respondido: ['ok', 'Respondeu'], encerrado: ['andamento', 'Encerrado'] },
      aviso: { publicado: ['espera', 'No portal'], retirado: ['andamento', 'Retirado'] },
      reconhecimento: { enviado: ['ok', 'Enviado'] },
      agenda: { marcada: ['aberta', 'Marcada'], feita: ['ok', 'Feita'], cancelada: ['andamento', 'Cancelada'] },
    };
    const [classe, texto] = (MAPA[r.tipo] || {})[r.estado] || ['andamento', 'Encerrado'];
    return s(classe, r.tipo === 'adiamento' && r.estado === 'ativo' && !ap.ativa(r) ? 'Acabou' : texto);
  }

  const TITULO = {
    delegacao: (r) => `👤 Delegada a ${esc(r.paraNome)}${r.paraCargo ? ` <small>· ${esc(r.paraCargo)}</small>` : ''}`,
    explicacao: (r) => `❓ Explicação pedida à ${esc(sec(r.area))}`,
    adiamento: (r) => `🕰 Adiada por ${esc(ROTULO_HORAS[r.horas] || `${r.horas} h`)}`,
    orgao: (r) => `🏢 Ofício a ${esc(r.orgaoNome)}`,
    aviso: () => '📢 Aviso à população',
    reconhecimento: (r) => `👏 Reconhecimento à ${esc(sec(r.area))}`,
    agenda: (r) => `📅 ${esc(GC.FORMAS_AGENDA[r.forma] || 'Agenda')} · ${esc(GC.quandoAgenda(r.quando))}`,
  };

  // O que foi pedido, na abertura do registro.
  function pedido(r) {
    const linha = (rot, txt) => (txt ? `<p class="aj-oque"><b>${rot}:</b> ${esc(txt)}</p>` : '');
    if (r.tipo === 'delegacao') return linha('Orientação', r.texto);
    if (r.tipo === 'explicacao') return linha('Pergunta', r.pergunta);
    if (r.tipo === 'orgao') return linha('Pedido', r.texto);
    if (r.tipo === 'aviso') return linha('Texto', r.texto);
    if (r.tipo === 'reconhecimento') return linha('Mensagem', r.texto);
    if (r.tipo === 'agenda') return linha('Assunto', r.texto);
    return linha('Motivo', `${GC.MOTIVOS_ADIAMENTO[r.motivo]}${r.texto ? ` · ${r.texto}` : ''}`);
  }

  function passo(p) {
    const extra = p.texto ? `: “${esc(p.texto)}”` : '';
    const sim = p.simulada ? ' <small class="cb-sim">simulada</small>' : '';
    const o = {
      retorno: `<b>Deu o retorno</b>${extra}`,
      retomada: `<b>O prefeito retomou a decisão</b>${extra}`,
      resposta: `<b>Explicou</b>${extra}`,
      pergunta: `<b>O prefeito perguntou de novo</b>${extra}`,
      lida: '✅ <b>O prefeito leu a explicação</b>',
      retomado: '<b>O prefeito desfez o adiamento</b>',
      retorno_orgao: `<b>O órgão respondeu</b>${extra}`,
      retirado: '<b>Aviso retirado do portal</b>',
      feita: `✅ <b>Feita</b>${extra}`,
      cancelada: '<b>Cancelada</b>',
      encerrada: '<b>A ocorrência foi encerrada</b>',
    }[p.tipo] || esc(p.tipo);
    return `<li><span>${ha(p.em)}${p.quem ? ` · ${esc(p.quem)}` : ''}</span><p>${o}${sim}</p></li>`;
  }

  const rodape = (rotulo, perigo) => `<p class="cb-erro" role="alert"></p><div class="cb-form-pe"><button type="submit" class="btn-acao principal${perigo ? ' ap-perigo' : ''}">${rotulo}</button><button type="button" class="btn-sec" data-ap-fechar>Cancelar</button></div>`;

  // Botões e formulários do papel de quem vê, num registro.
  function acoes(r) {
    const id = esc(r.id);
    const b = [];
    const f = [];
    const ap = reg();
    const botao = (attr, rot, principal) => b.push(`<button type="button" class="${principal ? 'btn-acao principal' : 'btn-sec'}" ${attr} data-ap-id="${id}">${rot}</button>`);
    if (r.tipo === 'delegacao' && r.estado === 'ativa') {
      if (pode('retornar', r)) {
        botao('data-ap-form="retornar"', 'Dar o retorno', true);
        f.push(`<form class="cb-form" data-ap-tipo="retornar" data-ap-id="${id}" hidden><p class="cb-form-tit">O que você decidiu ou fez?</p>
          <label class="cb-campo">Retorno ao prefeito<textarea name="texto" rows="2" maxlength="400" placeholder="Ex.: falei com a Defesa Civil; a equipe entra às 15 h"></textarea></label>${rodape('Enviar retorno')}</form>`);
      }
      if (pode('retomar', r)) botao('data-ap="retomar"', 'Retomar a decisão');
    }
    if (r.tipo === 'explicacao' && r.estado === 'aberta' && pode('responder', r)) {
      botao('data-ap-form="responder"', 'Explicar', true);
      f.push(`<form class="cb-form" data-ap-tipo="responder" data-ap-id="${id}" hidden><p class="cb-form-tit">Sua explicação ao prefeito</p>
        <label class="cb-campo">Explicação<textarea name="texto" rows="3" maxlength="600" placeholder="O que aconteceu, o que já foi feito e o que falta"></textarea></label>${rodape('Enviar')}</form>`);
    }
    if (r.tipo === 'explicacao' && r.estado === 'respondida') {
      if (pode('lida', r)) botao('data-ap="lida"', '✓ Entendido', true);
      if (pode('perguntar', r)) {
        botao('data-ap-form="perguntar"', 'Perguntar de novo');
        f.push(`<form class="cb-form" data-ap-tipo="perguntar" data-ap-id="${id}" hidden><p class="cb-form-tit">O que ainda falta saber?</p>
          <label class="cb-campo">Pergunta<textarea name="texto" rows="2" maxlength="400"></textarea></label>${rodape('Perguntar')}</form>`);
      }
    }
    if (r.tipo === 'adiamento' && ap.ativa(r) && pode('desfazer', r)) botao('data-ap="desfazer"', 'Desfazer o adiamento');
    if (r.tipo === 'orgao' && r.estado === 'aguardando' && pode('retorno_orgao', r)) {
      botao('data-ap-form="retorno_orgao"', 'Registrar o retorno', ap.vencida(r));
      f.push(`<form class="cb-form" data-ap-tipo="retorno_orgao" data-ap-id="${id}" hidden><p class="cb-form-tit">O que ${esc(r.orgaoNome)} respondeu?</p>
        <label class="cb-campo">Retorno<textarea name="texto" rows="2" maxlength="400" placeholder="Ex.: equipe da concessionária no local às 14 h"></textarea></label>${rodape('Registrar')}</form>`);
    }
    if (r.tipo === 'aviso' && r.estado === 'publicado' && pode('retirar_aviso', r)) botao('data-ap="retirar_aviso"', 'Retirar do portal');
    if (r.tipo === 'agenda' && r.estado === 'marcada' && pode('agenda_feita', r)) {
      botao('data-ap="agenda_feita"', 'Foi feita', GC.agora() > r.quando);
      botao('data-ap="agenda_cancelar"', 'Cancelar');
    }
    return (b.length ? `<div class="cb-botoes">${b.join('')}</div>` : '') + f.join('');
  }

  // Um registro: o que é, a situação, o pedido, o histórico e as ações. comTitulo: na lista da aba.
  function item(r, { comTitulo = false } = {}) {
    const alerta = reg().vencida(r) || (r.tipo === 'explicacao' && r.estado === 'respondida');
    const resumo = r.tipo === 'delegacao' && r.estado === 'ativa' ? '' : GC.resumoAcaoPrefeito(r).replace(/^\S+ /, '');
    return `<article class="ap-item ap-${r.tipo}${alerta ? ' pede' : ''}" data-ap-caixa="${esc(r.id)}"${comTitulo ? ` data-ap-abrir="${esc(r.ocorrenciaId)}" data-abre-gaveta tabindex="0"` : ''}>
      <div class="cb-item-topo"><h4>${comTitulo ? `${esc(r.retrato.titulo)} · ` : ''}${TITULO[r.tipo] ? TITULO[r.tipo](r) : esc(r.tipo)}</h4>${selo(r)}</div>
      <div class="cb-item-meta">${comTitulo ? `${esc(bairro(r.retrato.bairroId).nome)} · ` : ''}${esc(r.de.quem)} · ${ha(r.em)}</div>
      ${pedido(r)}
      ${resumo ? `<p class="cb-resumo">${esc(resumo)}</p>` : ''}
      ${r.passos.length ? `<ul class="cb-historico">${r.passos.map(passo).join('')}</ul>` : ''}
      ${acoes(r)}
      ${comTitulo ? `<div class="cb-item-pe"><button type="button" class="alerta-ver" data-ap-abrir="${esc(r.ocorrenciaId)}">Detalhes</button></div>` : ''}
    </article>`;
  }

  // Bloco no detalhe: só o que aconteceu. Em curso (ou que pede algo) em cima; o resto em "Histórico".
  GC.htmlBlocoAcoesPrefeito = function (o) {
    if (!o || !reg()) return '';
    const ap = reg();
    const lista = ap.daOcorrencia(o.id).filter((r) => r.tipo !== 'acompanhamento').sort((a, b) => b.em - a.em);
    if (!lista.length) return '';
    const vivo = (r) => ap.ativa(r) || ap.vencida(r) || (r.tipo === 'explicacao' && r.estado === 'respondida');
    const agora = lista.filter(vivo);
    const antes = lista.filter((r) => !vivo(r));
    return `
      <section class="ap-bloco" data-ap-caixa="bloco-${esc(o.id)}">
        <div class="cb-bloco-cab"><h3>🏛 Decisões do prefeito</h3></div>
        ${agora.map((r) => item(r)).join('')}
        ${antes.length ? `<details class="ap-historico"${agora.length ? '' : ' open'}><summary>Histórico (${antes.length})</summary>${antes.map((r) => item(r)).join('')}</details>` : ''}
      </section>`;
  };

  // ---------- a barra de ações ----------
  // O que o gabinete ainda pode fazer nesta ocorrência (cada uma, uma de cada vez).
  GC.novasAcoesPrefeito = function (o) {
    if (!o || !reg()) return [];
    const ap = reg();
    const livre = (acao, tipo) => pode(acao, o) && !(tipo && ap.ativaDe(o.id, tipo));
    const r = [];
    if (o.status !== 'resolvida') {
      if (livre('delegar', 'delegacao')) r.push('delegar');
      if (livre('explicar', 'explicacao')) r.push('explicar');
      // Adiar não combina com quem já priorizou, convocou gabinete ou está cobrando.
      const cobrando = GC.cobrancas && GC.cobrancas.aberta(o.id);
      if (livre('adiar', 'adiamento') && !o.acaoPrefeito && !cobrando) r.push('adiar');
      if (livre('definir_pasta')) r.push('definir_pasta');
      if (livre('orgao', 'orgao')) r.push('orgao');
      if (livre('avisar', 'aviso')) r.push('avisar');
      if (livre('agendar', 'agenda')) r.push('agendar');
      if (livre('falso_alarme')) r.push('falso_alarme');
    }
    if (pode('reconhecer', o) && !ap.daOcorrencia(o.id).some((x) => x.tipo === 'reconhecimento')) r.push('reconhecer');
    if (pode('reabrir', o)) r.push('reabrir');
    return r;
  };

  // Itens do menu: rótulo e uma linha que diz o efeito. grupo: onde aparecem. loja: ação da store (data-acao).
  const ITENS = {
    cobrar: { grupo: 0, rotulo: '📣 Cobrar a secretaria', dica: 'Resposta com prazo, por escrito', loja: true },
    priorizar: { grupo: 0, rotulo: '⚡ Priorizar', dica: 'O tempo que falta cai pela metade', loja: true },
    explicar: { grupo: 0, rotulo: '❓ Pedir explicação', dica: 'Pergunta sem cobrar; o prazo não muda' },
    gabinete: { grupo: 0, rotulo: '🚨 Gabinete de crise', dica: 'Reúne as secretarias com tarefas', loja: true },
    adiar: { grupo: 0, rotulo: '🕰 Adiar com motivo', dica: 'Sai de "Precisam de você" até a hora' },
    delegar: { grupo: 1, rotulo: '👤 Delegar a…', dica: 'Outra pessoa decide e dá o retorno' },
    definir_pasta: { grupo: 1, rotulo: '🧭 Definir a pasta responsável', dica: 'Encerra o empurra-empurra entre pastas' },
    orgao: { grupo: 1, rotulo: '🏢 Acionar órgão de fora', dica: 'Ofício com prazo para o retorno' },
    avisar: { grupo: 2, rotulo: '📢 Avisar a população', dica: 'Aviso no Portal do Cidadão' },
    agendar: { grupo: 2, rotulo: '📅 Agendar visita ou conversa', dica: 'Entra na agenda do gabinete' },
    reconhecer: { grupo: 2, rotulo: '👏 Reconhecer a equipe', dica: 'Mensagem para a secretaria' },
    falso_alarme: { grupo: 3, rotulo: '🚫 Marcar como falso alarme', dica: 'Fecha sem contar como resolvida' },
    reabrir: { grupo: 3, rotulo: '🔓 Reabrir', dica: 'Volta para a mesma pasta' },
  };
  const GRUPOS = ['Cobrar e decidir', 'Encaminhar', 'Comunicar', 'Encerrar'];

  function form(tipo, id, tit, corpo, nota, envia, perigo) {
    return `<form class="cb-form ap-form" data-ap-tipo="${tipo}" data-ap-id="${id}" hidden><p class="cb-form-tit">${tit}</p>${corpo}${nota ? `<p class="op-nota">${nota}</p>` : ''}${rodape(envia, perigo)}</form>`;
  }
  const opcoes = (obj, vazio = 'Escolha') => `<option value="">${vazio}</option>${Object.entries(obj).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('')}`;
  const radios = (nome, pares, marcado) => `<div class="cb-atalhos">${pares.map(([v, r]) => `<label><input type="radio" name="${nome}" value="${v}"${v === marcado ? ' checked' : ''}><span>${esc(r)}</span></label>`).join('')}</div>`;

  // Horários prontos para a agenda (os que ainda não passaram).
  function horarios() {
    const base = new Date(GC.agora());
    const em = (dias, h) => { const d = new Date(base); d.setDate(d.getDate() + dias); d.setHours(h, 0, 0, 0); return d.getTime(); };
    const nomeDia = (dias) => (dias === 0 ? 'Hoje' : dias === 1 ? 'Amanhã' : new Date(em(dias, 0)).toLocaleDateString('pt-BR', { weekday: 'long' }).replace(/^\w/, (c) => c.toUpperCase()));
    return [[0, 16], [1, 9], [1, 14], [2, 10]].map(([d, h]) => [em(d, h), `${nomeDia(d)} ${h} h`]).filter(([t]) => t > GC.agora() + 30 * MIN);
  }

  function formsNovas(o, novas) {
    const id = esc(o.id);
    const f = [];
    const u = usuario();
    if (novas.includes('delegar')) {
      const pessoas = GC.candidatosDelegacao(o, u && u.id).map((p) => `<option value="${esc(p.id)}">${esc(p.nome)} · ${esc(p.cargo || '')}</option>`).join('');
      f.push(form('delegar', id, 'Delegar a decisão sobre esta ocorrência',
        `<label class="cb-campo">A quem<select name="para"><option value="">Escolha</option>${pessoas}</select></label>
        <label class="cb-campo">Orientação (opcional)<textarea name="texto" rows="2" maxlength="300" placeholder="Ex.: veja com a Defesa Civil se dá para interditar a rua"></textarea></label>`,
        'Sai de “Precisam de você” e vai para quem recebe, que dá o retorno aqui. Você pode retomar a qualquer hora.', 'Delegar'));
    }
    if (novas.includes('explicar')) {
      const prazo = GC.tempoTexto((GC.PRAZO_RESPOSTA_MIN || {})[o.severidade] || 120);
      f.push(form('explicar', id, `Pedir explicação à ${esc(sec(o.area))}`,
        '<label class="cb-campo">O que você quer saber<textarea name="texto" rows="2" maxlength="400" placeholder="Ex.: por que a equipe ainda não saiu? O que está faltando?"></textarea></label>',
        `A secretaria responde por escrito aqui, em até ${esc(prazo)}. Não é cobrança: o prazo da ocorrência não muda.`, 'Pedir explicação'));
    }
    if (novas.includes('adiar')) {
      f.push(form('adiar', id, 'Adiar a decisão',
        `<p class="cb-campo-rot">Por quanto tempo</p>${radios('horas', GC.HORAS_ADIAMENTO.map((h) => [String(h), ROTULO_HORAS[h] || `${h} h`]), String(GC.HORAS_ADIAMENTO[0]))}
        <label class="cb-campo">Motivo<select name="motivo">${opcoes(GC.MOTIVOS_ADIAMENTO)}</select></label>
        <label class="cb-campo">Detalhe (obrigatório em “Outro motivo”)<input type="text" name="texto" maxlength="200" placeholder="Ex.: a obra da companhia de água termina sexta"></label>`,
        'Sai de “Precisam de você” até lá e volta sozinha. O prazo da secretaria não muda, e ela vê o motivo.', 'Adiar'));
    }
    if (novas.includes('definir_pasta')) {
      const pastas = GC.data.areas.map((a) => `<option value="${a.id}"${a.id === o.area ? ' selected' : ''}>${esc(a.secretaria.nome)}${a.id === o.area ? ' (a atual)' : ''}</option>`).join('');
      const devs = (o.devolucoes || []).length;
      f.push(form('definir_pasta', id, 'Definir a pasta responsável',
        `${devs ? `<p class="op-nota">Esta ocorrência já foi devolvida ${devs} ${devs === 1 ? 'vez' : 'vezes'} entre pastas.</p>` : ''}
        <label class="cb-campo">É da<select name="para">${pastas}</select></label>
        <label class="cb-campo">Por quê<textarea name="texto" rows="2" maxlength="300" placeholder="Ex.: poda de árvore na calçada é da Infraestrutura"></textarea></label>`,
        'A pasta escolhida passa a ser a responsável e não pode mais devolver. Se for outra pasta, o prazo de atendimento recomeça lá.', 'Definir', true));
    }
    if (novas.includes('orgao')) {
      f.push(form('orgao', id, 'Acionar um órgão de fora da Prefeitura',
        `<label class="cb-campo">Órgão<select name="orgao">${opcoes(GC.ORGAOS_EXTERNOS)}</select></label>
        <label class="cb-campo">Nome do órgão (só em “Outro órgão”)<input type="text" name="nomeOrgao" maxlength="80"></label>
        <label class="cb-campo">O que a Prefeitura pede<textarea name="texto" rows="2" maxlength="400" placeholder="Ex.: religar a energia dos 14 quarteirões e informar a previsão"></textarea></label>
        <p class="cb-campo-rot">Prazo para o retorno</p>${radios('dias', GC.DIAS_RETORNO_ORGAO.map((d) => [String(d), ROTULO_DIAS[d] || `${d} dias`]), String(GC.DIAS_RETORNO_ORGAO[0]))}`,
        'O ofício fica registrado com o prazo. A ocorrência mostra que espera o órgão (e não a secretaria), e o retorno se registra aqui.', 'Registrar ofício', true));
    }
    if (novas.includes('avisar')) {
      f.push(form('avisar', id, 'Avisar a população',
        `<label class="cb-campo">Texto do aviso (revise antes de publicar)<textarea name="texto" rows="4" maxlength="500">${esc(GC.textoAvisoPublico(o))}</textarea></label>`,
        'Aparece em Avisos, no Portal do Cidadão, para todos. Sai sozinho quando a ocorrência for resolvida, ou quando você retirar.', 'Publicar no portal', true));
    }
    if (novas.includes('agendar')) {
      const hs = horarios();
      f.push(form('agendar', id, 'Agendar visita ou conversa',
        `${radios('forma', Object.entries(GC.FORMAS_AGENDA), 'conversa')}
        <p class="cb-campo-rot">Quando</p>${radios('quando', hs.map(([t, r]) => [String(t), r]), hs[0] ? String(hs[0][0]) : '')}
        <label class="cb-campo">Assunto (opcional)<input type="text" name="texto" maxlength="200" placeholder="Ex.: plano para a fila da UBS"></label>`,
        `Entra na agenda do gabinete, e a ${esc(sec(o.area))} recebe o convite. Enquanto estiver marcada, a ocorrência desce em “Precisam de você”.`, 'Agendar'));
    }
    if (novas.includes('reconhecer')) {
      f.push(form('reconhecer', id, 'Reconhecer a equipe',
        `<label class="cb-campo">Mensagem<textarea name="texto" rows="2" maxlength="300">Bom trabalho em “${esc(o.titulo)}”. Obrigado pela resposta.</textarea></label>`,
        `Vai para a ${esc(sec(o.area))} e entra na pauta da reunião de resultados.`, 'Enviar'));
    }
    if (novas.includes('falso_alarme')) {
      const n = GC.falsosAlarmes && GC.storeAtual ? (GC.falsosAlarmes(GC.storeAtual)[o.regraId || o.tipo] || 0) : 0;
      const regra = o.regraDisparo ? `a regra “${esc(o.regraDisparo.nome)}”` : 'a regra deste alerta';
      f.push(form('falso_alarme', id, 'Marcar como falso alarme',
        `<label class="cb-campo">Motivo<select name="motivo">${opcoes(GC.MOTIVOS_FALSO_ALARME)}</select></label>
        <label class="cb-campo">Detalhe (obrigatório em “Outro motivo”)<input type="text" name="texto" maxlength="200"></label>`,
        `Fecha sem contar como resolvida (fica fora do “% no prazo”) e conta contra ${regra}${n ? `, que já tem ${n} ${n === 1 ? 'falso alarme' : 'falsos alarmes'}` : ''}.`, 'Marcar falso alarme', true));
    }
    if (novas.includes('reabrir')) {
      f.push(form('reabrir', id, 'Reabrir a ocorrência',
        `<label class="cb-campo">Motivo<select name="motivo">${opcoes(GC.MOTIVOS_REABRIR)}</select></label>
        <label class="cb-campo">Detalhe (obrigatório em “Outro motivo”)<input type="text" name="texto" maxlength="200" placeholder="Ex.: a foto é de outro trecho da rua"></label>`,
        `Volta para a ${esc(sec(o.area))}, sem equipe. O prazo para resolver continua contando de quando o alerta abriu.`, 'Reabrir'));
    }
    return f.join('');
  }

  // Barra no pé do detalhe. extra: o que mais fica na linha (o "Perguntar à Maia").
  GC.htmlBarraAcoes = function (o, extra = '') {
    const loja = GC.acoesDisponiveis ? GC.acoesDisponiveis(o) : [];
    const novas = GC.novasAcoesPrefeito(o);
    const principal = loja[0] || null;
    const noMenu = [...loja.slice(1), ...novas].filter((x) => ITENS[x]);
    const id = esc(o.id);
    const btnPrincipal = principal ? `<button type="button" class="btn-acao principal" data-acao="${principal}">${esc(ITENS[principal] ? ITENS[principal].rotulo : principal)}</button>` : '';
    let menu = '';
    let btnMenu = '';
    if (noMenu.length === 1) {
      // Uma ação só sobrando: vira botão, sem menu.
      const x = noMenu[0];
      btnMenu = ITENS[x].loja ? `<button type="button" class="btn-sec" data-acao="${x}">${esc(ITENS[x].rotulo)}</button>` : `<button type="button" class="btn-sec" data-ap-form="${x}" data-ap-id="${id}">${esc(ITENS[x].rotulo)}</button>`;
    } else if (noMenu.length > 1) {
      btnMenu = `<button type="button" class="btn-sec ap-mais" data-ap-menu aria-haspopup="true" aria-expanded="false">${principal ? 'Mais ações' : 'Ações'} <span aria-hidden="true">▾</span></button>`;
      menu = `<div class="ap-menu" role="menu" hidden>${GRUPOS.map((g, gi) => {
        const itens = noMenu.filter((x) => ITENS[x].grupo === gi);
        if (!itens.length) return '';
        return `<div class="ap-menu-grupo" role="group" aria-label="${g}"><p class="ap-menu-tit">${g}</p>${itens.map((x) => {
          const it = ITENS[x];
          const attr = it.loja ? `data-acao="${x}"` : `data-ap-form="${x}" data-ap-id="${id}"`;
          return `<button type="button" role="menuitem" class="ap-menu-item" ${attr}><b>${esc(it.rotulo)}</b><small>${esc(it.dica)}</small></button>`;
        }).join('')}</div>`;
      }).join('')}</div>`;
    }
    return `<div class="gaveta-botoes ap-barra" data-ap-caixa="barra-${id}">
      ${formsNovas(o, novas)}
      ${menu}
      <div class="ap-linha">${btnPrincipal}${btnMenu}${extra}</div>
    </div>`;
  };

  // Estrela do topo do detalhe: acompanhar (pessoal).
  GC.htmlEstrelaAcompanhar = function (o) {
    const u = usuario();
    if (!o || !reg() || !u || o.status === 'resolvida' || !pode('seguir', o)) return '';
    const ativo = !!reg().acompanhamento(o.id, u.id);
    const rot = ativo ? 'Acompanhando: você recebe aviso quando esta ocorrência andar' : 'Acompanhar: receber aviso quando esta ocorrência andar';
    return `<button type="button" class="ap-estrela${ativo ? ' ativo' : ''}" data-ap="seguir" data-ap-id="${esc(o.id)}" aria-pressed="${ativo}" title="${rot}" aria-label="${rot}"><i class="ti ti-star${ativo ? '-filled' : ''}" aria-hidden="true"></i><span>${ativo ? 'Acompanhando' : 'Acompanhar'}</span></button>`;
  };

  // Seção da aba Cobranças. Vazia: nada.
  GC.htmlAcoesPrefeitoLista = function (perfil = GC.perfil) {
    if (!reg()) return '';
    const { grupos } = reg().grupos(perfil || { id: 'prefeito' }, usuario());
    const cheios = grupos.filter((g) => g.itens.length);
    if (!cheios.length) return '';
    return cheios.map((g) => `<h3 class="alertas-divisor cb-grupo ${g.conta ? 'conta' : ''}">🏛 ${esc(g.titulo)} · ${g.itens.length}</h3>${g.itens.map((r) => (r.tipo === 'acompanhamento' ? itemAcompanhado(r) : item(r, { comTitulo: true }))).join('')}`).join('');
  };
  // Acompanhada: uma linha só (abre o detalhe).
  const itemAcompanhado = (r) => `<article class="ap-item ap-acompanhamento" data-ap-caixa="${esc(r.id)}" data-ap-abrir="${esc(r.ocorrenciaId)}" data-abre-gaveta tabindex="0">
      <div class="cb-item-topo"><h4>⭐ ${esc(r.retrato.titulo)}</h4><button type="button" class="alerta-ver" data-ap-abrir="${esc(r.ocorrenciaId)}">Ver</button></div>
      <div class="cb-item-meta">${esc(bairro(r.retrato.bairroId).nome)} · desde ${ha(r.em).replace('há ', '')}</div></article>`;

  // Quantos esperam quem vê (contador da aba Cobranças).
  GC.pendentesAcoesPrefeito = function (perfil = GC.perfil) {
    if (!reg()) return 0;
    return reg().grupos(perfil || { id: 'prefeito' }, usuario()).pendentes;
  };

  // acoesApp: { executar(acao, id, dados) → { ok, motivo }, abrir?(ocorrenciaId), aoConcluir?() }
  GC.ligarAcoesPrefeito = function (raiz, acoesApp) {
    if (!raiz || raiz.dataset.apLigado) return;
    raiz.dataset.apLigado = '1';
    const fecharMenus = () => raiz.querySelectorAll('.ap-menu:not([hidden])').forEach((m) => {
      m.hidden = true;
      const b = m.parentElement.querySelector('[data-ap-menu]');
      if (b) b.setAttribute('aria-expanded', 'false');
    });
    raiz.addEventListener('click', (e) => {
      const alvo = e.target.closest('[data-ap], [data-ap-form], [data-ap-fechar], [data-ap-abrir], [data-ap-menu]');
      // Item da store no menu (cobrar, priorizar, gabinete): quem trata é a gaveta; aqui só fecha o menu.
      if (e.target.closest('.ap-menu [data-acao]')) { fecharMenus(); return; }
      if (!alvo || !raiz.contains(alvo)) { if (!e.target.closest('.ap-menu')) fecharMenus(); return; }
      if (alvo.matches('[data-ap-menu]')) {
        e.stopPropagation();
        const m = alvo.closest('[data-ap-caixa]').querySelector(':scope > .ap-menu');
        const abrir = m.hidden;
        fecharMenus();
        m.hidden = !abrir;
        alvo.setAttribute('aria-expanded', String(abrir));
        if (abrir) { const p = m.querySelector('[role=menuitem]'); if (p) p.focus(); }
        return;
      }
      if (alvo.matches('[data-ap]')) {
        e.stopPropagation();
        fecharMenus();
        const r = acoesApp.executar(alvo.dataset.ap, alvo.dataset.apId, {}) || {};
        if (r.ok && acoesApp.aoConcluir) acoesApp.aoConcluir();
        return;
      }
      if (alvo.matches('[data-ap-form]')) {
        e.stopPropagation();
        fecharMenus();
        const dono = alvo.closest('[data-ap-caixa]');
        const tipo = alvo.dataset.apForm;
        dono.querySelectorAll(':scope > .cb-form').forEach((f) => { f.hidden = f.dataset.apTipo !== tipo || !f.hidden; });
        const aberto = dono.querySelector(`:scope > .cb-form[data-ap-tipo="${tipo}"]:not([hidden])`);
        if (aberto) { const campo = aberto.querySelector('select, textarea, input:not([type=radio])'); if (campo) campo.focus(); }
        return;
      }
      if (alvo.matches('[data-ap-fechar]')) { e.stopPropagation(); alvo.closest('.cb-form').hidden = true; return; }
      if (e.target.closest('.cb-form, button:not([data-ap-abrir])')) return;
      if (acoesApp.abrir) acoesApp.abrir(alvo.dataset.apAbrir);
    });
    // Esc fecha o menu antes de fechar a gaveta; setas andam pelos itens.
    raiz.addEventListener('keydown', (e) => {
      const m = e.target.closest && e.target.closest('.ap-menu');
      if (e.key === 'Escape' && raiz.querySelector('.ap-menu:not([hidden])')) {
        e.stopPropagation();
        const caixa = raiz.querySelector('.ap-menu:not([hidden])').closest('[data-ap-caixa]');
        fecharMenus();
        const b = caixa && caixa.querySelector('[data-ap-menu]');
        if (b) b.focus();
        return;
      }
      if (m && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
        e.preventDefault();
        const itens = [...m.querySelectorAll('[role=menuitem]')];
        const i = itens.indexOf(document.activeElement);
        itens[(i + (e.key === 'ArrowDown' ? 1 : -1) + itens.length) % itens.length].focus();
      }
    }, true);
    raiz.addEventListener('submit', (e) => {
      const form = e.target.closest('.cb-form[data-ap-tipo]');
      if (!form) return;
      e.preventDefault();
      e.stopPropagation();
      const f = new FormData(form);
      const s = (k) => (f.get(k) || '').toString();
      const dados = {
        texto: s('texto'), para: s('para'), motivo: s('motivo'), horas: Number(f.get('horas')) || 0,
        orgao: s('orgao'), nomeOrgao: s('nomeOrgao'), dias: Number(f.get('dias')) || 0, forma: s('forma'), quando: Number(f.get('quando')) || 0,
      };
      const r = acoesApp.executar(form.dataset.apTipo, form.dataset.apId, dados) || { ok: false };
      if (!r.ok) { form.querySelector('.cb-erro').textContent = GC.ERROS_ACAO_PREFEITO[r.motivo] || 'Não deu certo. Tente de novo.'; return; }
      form.hidden = true;
      if (acoesApp.aoConcluir) acoesApp.aoConcluir();
    });
  };
})(window.GC = window.GC || {});
