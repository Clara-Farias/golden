(function (GC) {
  // Rascunhos da Maia (spec 2026-11-12, Maia v2, fase 4): ofício de cobrança, comunicado à população, nota à imprensa
  // e resposta ao cidadão, montados com os dados do painel. Só texto (puro, testável em Node); o motor
  // (js/ia-roteiro.js) escolhe a secretaria e o bairro, e o chat mostra o rascunho editável.
  // Tom (identidade-visual/tom-de-voz.md): número primeiro, sem juridiquês ("outrossim", "no tocante a"), sem emoji.
  const nomeCidade = () => (GC.cidade && GC.cidade.nome) || 'Vila Dourada';
  const agora = () => new Date(GC.agora ? GC.agora() : Date.now());
  const bairroNome = (id) => ((GC.data.bairros || []).find((b) => b.id === id) || {}).nome || '';
  const areaDe = (id) => (GC.data.areas || []).find((a) => a.id === id);
  const plural = (n, um, varios) => `${n} ${Number(n) === 1 ? um : varios}`;
  const lista = (xs) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} e ${xs[xs.length - 1]}` : xs[0] || '');
  const semAcento = (t) => String(t).normalize('NFD').replace(/[̀-ͯ]/g, '');
  const dataPorExtenso = () => agora().toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });

  // "40 min", "3 h", "2 dias e 4 h".
  function tempo(min) {
    const m = Math.max(0, Math.round(min));
    if (m < 60) return `${m} min`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h} h`;
    const d = Math.floor(h / 24);
    const r = h % 24;
    return `${plural(d, 'dia', 'dias')}${r ? ` e ${r} h` : ''}`;
  }

  const SEV = { critica: 0, alta: 1, media: 2, baixa: 3 };
  const estourada = (o) => (GC.estourada ? GC.estourada(o) : false);
  const idade = (o) => (GC.idadeMin ? GC.idadeMin(o) : o.abertaHaMin || 0);
  const restante = (o) => (GC.prazoRestanteMin ? GC.prazoRestanteMin(o) : 0);
  // Ocorrências em aberto do recorte, estouradas primeiro e depois pela gravidade.
  function emAberto(ocorrencias, areaId, bairros) {
    return (ocorrencias || []).filter((o) => o.status !== 'resolvida' && (!areaId || o.area === areaId) && (!bairros || !bairros.length || bairros.includes(o.bairroId)))
      .sort((a, b) => (estourada(b) - estourada(a)) || (SEV[a.severidade] - SEV[b.severidade]) || (idade(b) - idade(a)));
  }

  // O que dizer à população em cada área (direto: orientação de segurança é a exceção do "a Maia sugere").
  const ORIENTACAO = {
    defesa_civil: ['Evite a região e não atravesse ruas alagadas.', 'Evite a regiao e nao atravesse ruas alagadas.'],
    infraestrutura: ['Não se aproxime de fios caídos e deixe os aparelhos fora da tomada até a energia voltar.', 'Nao se aproxime de fios caidos.'],
    saude: ['Em caso de urgência, procure a UPA mais próxima; para consultas, prefira a UBS do seu bairro.', 'Urgencia: procure a UPA.'],
    seguranca: ['Em caso de emergência, ligue 190.', 'Emergencia: ligue 190.'],
    mobilidade: ['Se puder, evite a região e use rotas alternativas.', 'Evite a regiao se puder.'],
    limpeza: ['Mantenha o lixo dentro de casa até a nova passagem do caminhão.', 'Guarde o lixo ate a nova coleta.'],
    educacao: ['Os responsáveis devem acompanhar os avisos da escola.', 'Acompanhe os avisos da escola.'],
  };
  const EMERGENCIAS = 'Emergências: Defesa Civil 199 · Bombeiros 193 · SAMU 192.';
  // SMS cabe em 160 caracteres, sem acento (alfabeto GSM): as partes entram enquanto couberem.
  function caberSms(partes) {
    let s = '';
    for (const p of partes.map(semAcento)) {
      const c = s ? `${s} ${p}` : p;
      if (c.length > 160) break;
      s = c;
    }
    return s.slice(0, 160);
  }

  // ", todas com o prazo estourado", ", 3 delas com o prazo estourado", ", todas ainda dentro do prazo".
  function prazoTexto(total, estouradas) {
    if (!estouradas) return total === 1 ? ', ainda dentro do prazo' : ', todas ainda dentro do prazo';
    if (estouradas === total) return total === 1 ? ', com o prazo estourado' : ', todas com o prazo estourado';
    return estouradas === 1 ? ', uma delas com o prazo estourado' : `, ${estouradas} delas com o prazo estourado`;
  }

  // ---- ofício de cobrança à secretaria ----
  function oficio({ areaId, bairros = [], ocorrencias, recorte = {} }) {
    const a = areaDe(areaId);
    if (!a) return null;
    const sec = a.secretaria.nome;
    let abertas = emAberto(ocorrencias, areaId, bairros);
    if (recorte.severidade) abertas = abertas.filter((o) => o.severidade === recorte.severidade);
    const estouradas = abertas.filter(estourada);
    const itens = (estouradas.length ? estouradas : abertas).slice(0, 8);
    const onde = bairros.length ? ` no bairro ${lista(bairros.map(bairroNome))}` : '';
    const d = (GC.data.desempenho30d || {})[areaId];
    const linhas = itens.map((o, i) => `${i + 1}. ${o.titulo} (${bairroNome(o.bairroId)}) · aberta há ${tempo(idade(o))}${estourada(o) ? ` · prazo estourado há ${tempo(-restante(o))}` : ` · faltam ${tempo(restante(o))} para o prazo`}`);
    const situacao = abertas.length
      ? `O painel da Prefeitura registra ${plural(abertas.length, 'ocorrência', 'ocorrências')} da ${sec} em aberto${onde}${prazoTexto(abertas.length, estouradas.length)}:`
      : `O painel da Prefeitura não registra ocorrências da ${sec} em aberto${onde} neste momento.`;
    const desempenho = d ? `Nos últimos 30 dias, a secretaria resolveu ${d.noPrazoPct}% das ocorrências no prazo${d.anterior ? ` (no mês anterior, ${d.anterior.noPrazoPct}%)` : ''}, com tempo médio de ${String(d.tempoMedioH).replace('.', ',')} h.` : '';
    const pedido = itens.length
      ? 'Solicito o envio, em até 48 horas, de um plano com a equipe designada e a previsão de conclusão de cada item acima.'
      : 'Solicito o envio, em até 48 horas, de um plano para recuperar o cumprimento dos prazos.';
    const texto = [
      `Ofício nº ____/${agora().getFullYear()} · Gabinete do Prefeito`,
      `${nomeCidade()}, ${dataPorExtenso()}.`,
      '',
      `Ao(À) titular da ${sec}`,
      '',
      `Assunto: providências para ocorrências ${estouradas.length ? 'com prazo estourado' : 'em aberto'}${onde}`,
      '',
      'Senhor(a) Secretário(a),',
      '',
      situacao,
      ...(linhas.length ? ['', ...linhas] : []),
      ...(abertas.length > itens.length ? [`(e mais ${plural(abertas.length - itens.length, 'ocorrência', 'ocorrências')} no painel)`] : []),
      '',
      ...(desempenho ? [desempenho, ''] : []),
      pedido,
      '',
      'Atenciosamente,',
      '',
      'Gabinete do Prefeito',
      `Prefeitura Municipal de ${nomeCidade()}`,
    ].join('\n');
    return {
      tipo: 'oficio',
      titulo: `Ofício de cobrança · ${sec}`,
      texto,
      resumo: itens.length ? `com ${plural(itens.length, 'ocorrência', 'ocorrências')}${estouradas.length ? ' de prazo estourado' : ' em aberto'}` : 'sem ocorrência em aberto, pedindo um plano para os prazos',
      ocorrencias: itens.map((o) => o.id),
    };
  }

  // ---- comunicado à população: a ocorrência mais grave do recorte ----
  function comunicado({ areaId, bairros = [], ocorrencias, ocorrencia }) {
    const o = ocorrencia || emAberto(ocorrencias, areaId, bairros)[0];
    if (!o) return null;
    const a = areaDe(o.area);
    const [orienta, orientaCurta] = ORIENTACAO[o.area] || ['Acompanhe os canais oficiais da Prefeitura.', 'Acompanhe os canais oficiais.'];
    const b = bairroNome(o.bairroId);
    const equipe = o.status === 'em_campo' ? `A equipe da ${a.secretaria.nome} já está no local.` : `O caso já está com a ${a.secretaria.nome}.`;
    return {
      tipo: 'comunicado',
      titulo: `Comunicado à população · ${o.titulo}`,
      texto: `A Prefeitura de ${nomeCidade()} informa: ${o.titulo.charAt(0).toLowerCase()}${o.titulo.slice(1)} (${b}). ${equipe} ${orienta} Novas informações serão publicadas nos canais oficiais da Prefeitura. ${EMERGENCIAS}`,
      sms: caberSms([`Prefeitura de ${nomeCidade()}: ${o.titulo} (${b}).`, orientaCurta, 'Emergencia: 199.']),
      resumo: `sobre "${o.titulo}" (${b})`,
      ocorrencias: [o.id],
    };
  }

  // ---- nota à imprensa: os números da área no mês ----
  function nota({ areaId, bairros = [], ocorrencias }) {
    const a = areaDe(areaId);
    if (!a) return null;
    const hist = (GC.data.historico30d || {})[areaId];
    const ant = (GC.data.historicoMesAnterior || {})[areaId];
    const somar = (m) => (bairros.length ? bairros.reduce((s, id) => s + ((m || {})[id] || 0), 0) : Object.values(m || {}).reduce((s, n) => s + n, 0));
    const onde = bairros.length ? ` no bairro ${lista(bairros.map(bairroNome))}` : '';
    const d = (GC.data.desempenho30d || {})[areaId];
    const grave = emAberto(ocorrencias, areaId, bairros)[0];
    const n = hist ? somar(hist) : null;
    const nAnt = ant ? somar(ant) : null;
    const comparacao = n != null && nAnt != null && nAnt ? ` (${n >= nAnt ? '+' : ''}${Math.round(((n - nAnt) / nAnt) * 100)}% em relação ao mês anterior)` : '';
    const partes = [
      n != null ? `Nos últimos 30 dias, a ${a.secretaria.nome} registrou ${plural(n, 'ocorrência', 'ocorrências')}${onde}${comparacao}.` : '',
      d ? `${d.noPrazoPct}% das ocorrências foram resolvidas no prazo, com tempo médio de ${String(d.tempoMedioH).replace('.', ',')} h.` : '',
      grave ? `Neste momento, a secretaria atende ${grave.titulo.charAt(0).toLowerCase()}${grave.titulo.slice(1)} (${bairroNome(grave.bairroId)}).` : '',
      'A Prefeitura acompanha os números em tempo real e divulga novas informações pelos canais oficiais.',
    ].filter(Boolean);
    return {
      tipo: 'nota',
      titulo: `Nota à imprensa · ${a.secretaria.nome}`,
      texto: [`Nota à imprensa · ${a.secretaria.nome}`, '', `A Prefeitura de ${nomeCidade()} informa:`, '', partes.join(' '), '', `Assessoria de Comunicação · Prefeitura de ${nomeCidade()} · ${dataPorExtenso()}`].join('\n'),
      resumo: `com os números da ${a.secretaria.nome}${onde} no mês`,
      ocorrencias: grave ? [grave.id] : [],
    };
  }

  // ---- resposta ao cidadão: o que há em aberto no bairro, naquela área ----
  function resposta({ areaId, bairros = [], ocorrencias }) {
    const a = areaDe(areaId);
    if (!a) return null;
    const b = bairros[0];
    const o = emAberto(ocorrencias, areaId, b ? [b] : [])[0];
    const onde = b ? ` no bairro ${bairroNome(b)}` : '';
    const corpo = o
      ? `O caso "${o.titulo}" (${bairroNome(o.bairroId)}) já está com a ${a.secretaria.nome}${o.status === 'em_campo' ? ', com equipe no local'
        : estourada(o) ? '. O prazo de atendimento já passou, e o Gabinete do Prefeito acompanha o caso' : `, com prazo de atendimento de ${tempo(o.prazoMin || 0)}`}.`
      : `Não há registro em aberto sobre isso${onde} no painel da Prefeitura. Vamos encaminhar sua mensagem à ${a.secretaria.nome} para verificar.`;
    return {
      tipo: 'resposta',
      titulo: `Resposta ao cidadão · ${a.nome}${onde}`,
      texto: `Olá. Recebemos sua mensagem sobre ${a.nome.toLowerCase()}${onde}. ${corpo} Você pode acompanhar pelo Portal do Cidadão. Obrigado por avisar.\n\nPrefeitura de ${nomeCidade()}`,
      resumo: o ? `sobre "${o.titulo}"` : `sobre ${a.nome.toLowerCase()}${onde}`,
      ocorrencias: o ? [o.id] : [],
    };
  }

  // ---- post para redes sociais (workshop de 18/11: "gerar conteúdo para redes sociais, além da nota à imprensa") ----
  // Prestação de contas em tom de rede: o que foi entregue, os números do mês e o que vem. Legenda para Instagram e
  // Facebook (até 2.200 caracteres, com hashtags) e uma versão curta para X e status do WhatsApp (até 280).
  // Sem área: a cidade toda. Sem emoji no rascunho (tom de voz); quem publica decide.
  const dataCurta = (iso) => { const d = new Date(`${iso}T12:00:00`); return d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' }); };
  const hashtag = (t) => `#${semAcento(t).replace(/[^A-Za-z0-9]+/g, '')}`;
  const comBairro = (e) => { const b = e.bairroId ? bairroNome(e.bairroId) : ''; return b && !e.titulo.includes(b) ? `${e.titulo} (${b})` : e.titulo; };
  function post({ areaId, bairros = [] }) {
    const a = areaId ? areaDe(areaId) : null;
    if (areaId && !a) return null;
    const cidade = nomeCidade();
    const areas = a ? [a.id] : null;
    const ent = GC.entregas ? GC.entregas.lista({ areas }) : [];
    const hoje = GC.relogio ? GC.relogio.hoje : agora().toISOString().slice(0, 10);
    const entregues = ent.filter((e) => e.situacao === 'entregue' && e.dataAtual <= hoje && (!bairros.length || bairros.includes(e.bairroId))).sort((x, y) => y.dataAtual.localeCompare(x.dataAtual)).slice(0, 3);
    const proxima = ent.filter((e) => e.situacao === 'no_prazo' && e.dataAtual >= hoje).sort((x, y) => x.dataAtual.localeCompare(y.dataAtual))[0];
    const d = a ? (GC.data.desempenho30d || {})[a.id] : null;
    const resolvidas = a && GC.data.historico30d && GC.data.historico30d[a.id] ? Object.values(GC.data.historico30d[a.id]).reduce((s, n) => s + n, 0) : null;
    if (!entregues.length && !d && !proxima) return null;
    const onde = bairros.length ? ` no ${bairroNome(bairros[0])}` : '';
    const linhas = [
      a ? `${a.secretaria.nome}${onde}: prestação de contas do mês.` : `Prefeitura de ${cidade}: o que entregamos${onde} e o que vem por aí.`,
      '',
      ...(entregues.length ? ['Entregue:', ...entregues.map((e) => `- ${comBairro(e)}, em ${dataCurta(e.dataAtual)}`), ''] : []),
      ...(d ? [`Nos últimos 30 dias${resolvidas != null ? `, ${plural(resolvidas, 'ocorrência registrada', 'ocorrências registradas')}` : ''}: ${d.noPrazoPct}% resolvidas no prazo.`, ''] : []),
      ...(proxima ? [`Próxima entrega: ${comBairro(proxima)}, prevista para ${dataCurta(proxima.dataAtual)}.`, ''] : []),
      'Acompanhe tudo no Portal do Cidadão e mande sua solicitação pelo WhatsApp da Prefeitura.',
      '',
      [hashtag(cidade), a ? hashtag(a.nome) : '#PrestacaoDeContas', '#GestaoPublica'].join(' '),
    ];
    const curtoPartes = [
      entregues.length ? `Entregue: ${comBairro(entregues[0])}.` : '',
      d ? `${d.noPrazoPct}% das ocorrências${a ? ` da ${a.secretaria.nome}` : ''} resolvidas no prazo em 30 dias.` : '',
      proxima ? `Próxima: ${proxima.titulo}, ${dataCurta(proxima.dataAtual)}.` : '',
      hashtag(cidade),
    ].filter(Boolean);
    let curto = '';
    for (const p of curtoPartes) { const c = curto ? `${curto} ${p}` : p; if (c.length > 280) break; curto = c; }
    return {
      tipo: 'post',
      titulo: `Post para redes sociais · ${a ? a.secretaria.nome : `Prefeitura de ${cidade}`}`,
      texto: linhas.join('\n'),
      curto,
      resumo: a ? `com as entregas e os números da ${a.secretaria.nome}${onde}` : `com as entregas da Prefeitura${onde}`,
      ocorrencias: [],
    };
  }

  GC.iaRascunho = { oficio, comunicado, nota, resposta, post, tempo, emAberto };
})(window.GC = window.GC || {});
