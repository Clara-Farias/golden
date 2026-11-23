(function (GC) {
  GC.STATUS = ['encaminhada', 'em_campo', 'resolvida'];
  GC.agora = GC.agora || (() => Date.now());
  const PESO = { critica: 0, alta: 1, media: 2 };
  const ORDEM_MOTIVO = { prazo: 0, prorrogacao: 1, escalada: 2, pausa_longa: 3, vai_estourar: 4, conjunta: 5, recorrente: 6 };
  const TEXTO_AVANCO = { em_campo: '🚧 Equipe em campo', resolvida: '✅ Resolvida' };
  const MAX_AUTOMATICO = 15; // a cidade sozinha não esvazia o mapa abaixo disso
  const META_PRAZO = 85; // % de ocorrências resolvidas no prazo
  const REARME_MEDIDA_MIN = 360; // regra medida: o mesmo alvo resolvido só dispara de novo depois disso

  function tempo(min) {
    if (min < 60) return `${Math.round(min)} min`;
    if (min < 2880) return `${Math.round(min / 60)} h`;
    return `${Math.round(min / 1440)} dias`;
  }
  GC.tempoTexto = tempo;

  // Prazos (atendimento e solução), idade, restante e estourada: js/prazos.js.

  // Escalonamento da regra que disparou (js/regras-alerta.js, fase 3): os degraus já alcançados enquanto a
  // ocorrência segue sem equipe em campo. Ocorrência sem retrato da regra (as iniciais) não escala.
  GC.escalonamentoAlcancado = function (o) {
    const r = o && o.regraDisparo;
    if (!r || !r.escalonamento || !r.escalonamento.length || o.status !== 'encaminhada') return [];
    const idade = GC.tempoDePrazoMin(o); // o relógio do prazo: pausada, não sobe degrau
    return r.escalonamento.filter((e) => idade >= e.aposMin).sort((a, b) => a.aposMin - b.aposMin);
  };
  // A regra pede para propor a cobrança: o botão "Cobrar" aparece antes do prazo estourar.
  GC.cobrancaProposta = (o) => GC.escalonamentoAlcancado(o).some((e) => e.acao === 'propor_cobranca');

  // Por que a ocorrência precisa do prefeito: prazo estourado, escalada pela regra, mais de uma secretaria,
  // caso repetido. Os limites (caso repetido, várias secretarias) vêm de GC.limitesAtencao (js/regras-alerta.js).
  GC.motivosAtencao = function (o) {
    if (o.status === 'resolvida') return [];
    const lim = GC.limitesAtencao ? GC.limitesAtencao() : { recorrenteMin: 6, recorrenteGravidades: ['critica', 'alta'], conjunta: true, quasePct: 75, antecipar: true };
    const motivos = [];
    // curto: rótulo visível dos motivos extras no cartão (o emoji sozinho não diz nada no toque).
    if (GC.estourada(o)) motivos.push({ tipo: 'prazo', texto: `⏰ Prazo estourado há ${tempo(-GC.prazoRestanteMin(o))}`, curto: '⏰ prazo estourado' });
    const degraus = GC.escalonamentoAlcancado(o);
    if (degraus.length) {
      const pede = [...new Set(degraus.map((e) => e.acao))].map((a) => (a === 'propor_cobranca' ? 'cobrar a secretaria' : 'atenção do Gabinete')).join(' e ');
      motivos.push({ tipo: 'escalada', texto: `🔔 ${tempo(GC.idadeMin(o))} sem equipe em campo: a regra “${o.regraDisparo.nome}” pede ${pede}`, curto: '🔔 escalada pela regra' });
    }
    // Antes de estourar: sem equipe em campo e já usou a fração do prazo da barra laranja (padrão 75%).
    // O prefeito vê com tempo de agir, não só depois que estourou.
    if (lim.antecipar !== false && o.status === 'encaminhada' && !GC.estourada(o) && !GC.pausaAtual(o) && GC.tempoDePrazoMin(o) / o.prazoMin >= (lim.quasePct || 75) / 100) {
      motivos.push({ tipo: 'vai_estourar', texto: `⏳ Vai estourar em ${tempo(GC.prazoRestanteMin(o))} sem equipe em campo`, curto: '⏳ vai estourar' });
    }
    // Prazos, fase 2 (js/prazos.js): pedido de mais prazo esperando o prefeito e pausa que passou do teto.
    const pedido = GC.prorrogacaoPendente(o);
    if (pedido) motivos.push({ tipo: 'prorrogacao', texto: `⏳ A secretaria pede mais ${tempo(pedido.minutos)} para ${GC.FASES_PRAZO[pedido.fase]}`, curto: '⏳ pede mais prazo' });
    if (GC.pausaLonga(o)) {
      const pa = GC.pausaAtual(o);
      motivos.push({ tipo: 'pausa_longa', texto: `⏸ Prazo pausado há ${tempo((GC.agora() - pa.desde) / 60000)}: ${GC.MOTIVOS_PAUSA[pa.motivo] || pa.motivo}`, curto: '⏸ pausada há muito' });
    }
    if (lim.conjunta && (o.areasEnvolvidas || []).length > 1) motivos.push({ tipo: 'conjunta', texto: `🤝 Envolve ${o.areasEnvolvidas.length} secretarias`, curto: `🤝 ${o.areasEnvolvidas.length} secretarias` });
    // O histórico é por secretaria e bairro, não por tipo de problema: o texto diz isso, para
    // "7º chamado" não ser lido como "a energia caiu 7 vezes aqui".
    const n = ((GC.data.historico30d || {})[o.area] || {})[o.bairroId] || 0;
    if (lim.recorrenteGravidades.includes(o.severidade) && n >= lim.recorrenteMin) {
      const nomeArea = (GC.data.areas.find((a) => a.id === o.area) || { nome: 'da secretaria' }).nome;
      motivos.push({ tipo: 'recorrente', texto: `🔁 ${n + 1}º chamado de ${nomeArea} no bairro em 30 dias`, curto: '🔁 bairro recorrente' });
    }
    return motivos;
  };

  // Cobrança aberta da ocorrência (js/cobrancas.js), se houver.
  const cobrancaDe = (o) => (o && GC.cobrancas ? GC.cobrancas.aberta(o.id) : null);

  // Ações do prefeito: priorizar e gabinete são uma por ocorrência (acaoPrefeito). A cobrança tem registro
  // próprio (js/cobrancas.js) e não impede o gabinete depois. Cobrar: prazo estourado e nenhuma cobrança
  // aberta; a vencida se cobra de novo pelo bloco da cobrança, não por aqui.
  // Ações já feitas pelo prefeito na ocorrência (a última fica também em acaoPrefeito).
  GC.acoesFeitas = (o) => (o ? o.acoesFeitas || (o.acaoPrefeito ? [o.acaoPrefeito] : []) : []);
  GC.acoesDisponiveis = function (o) {
    if (!o || o.status === 'resolvida') return [];
    const feitas = GC.acoesFeitas(o);
    const acoes = [];
    if ((GC.estourada(o) || GC.cobrancaProposta(o) || GC.pausaLonga(o)) && !cobrancaDe(o)) acoes.push('cobrar');
    if ((o.areasEnvolvidas || []).length > 1 && !feitas.includes('gabinete')) acoes.push('gabinete');
    if (!feitas.includes('priorizar')) acoes.push('priorizar');
    return acoes;
  };

  // Alguém já agiu e ainda está no prazo: priorizada, gabinete, cobrança que não venceu, ou delegada, adiada
  // ou com explicação pedida (js/acoes-prefeito.js).
  // Cobrança vencida volta a pedir atenção (pulsa e sobe na lista).
  GC.tratada = function (o) {
    if (!o) return false;
    if (o.acaoPrefeito) return true;
    const c = cobrancaDe(o);
    if (c && !GC.cobrancas.vencida(c)) return true;
    // Delegada, adiada ou com explicação pedida e no prazo (js/acoes-prefeito.js).
    return !!(GC.acoesPrefeito && GC.acoesPrefeito.tratando(o));
  };

  // Situação em uma linha (cartões, gaveta, resumo do ponto no mapa).
  const ACAO_FEITA = { cobrar: '📣 Cobrada', priorizar: '⚡ Priorizada · equipe a caminho', gabinete: '🚨 Gabinete convocado' };
  const ACAO_CURTA = { cobrar: '📣 cobrada', priorizar: '⚡ priorizada', gabinete: '🚨 gabinete' };
  GC.situacao = function (o) {
    if (o.status === 'resolvida') return o.duplicadaDe ? '🔗 Juntada a outra ocorrência' : o.falsoAlarme ? '🚫 Falso alarme' : '✅ Resolvida';
    const c = cobrancaDe(o);
    const pa = GC.pausaAtual(o);
    if (pa) return `⏸ Prazo pausado há ${tempo(Math.max(1, (GC.agora() - pa.desde) / 60000))} · ${GC.MOTIVOS_PAUSA[pa.motivo] || pa.motivo}${c ? ' · 📣 cobrada' : ''}`;
    // Equipe da pasta (js/data-equipes.js), quando há: o nome diz quem está indo ou está lá.
    const eq = o.equipeId && GC.nomeEquipe ? GC.nomeEquipe(o.equipeId) : null;
    if (o.status === 'em_campo') return `🚧 ${eq ? `${eq} no local` : 'Equipe em campo'}${o.acaoPrefeito ? ` · ${ACAO_CURTA[o.acaoPrefeito]}` : c ? ' · 📣 cobrada' : ''}`;
    if (eq) return `🚐 ${eq} a caminho há ${tempo(Math.max(1, (GC.agora() - (o.despachadaEm || GC.agora())) / 60000))}${c ? ' · 📣 cobrada' : ''}`;
    if (c && GC.resumoCobranca) return GC.resumoCobranca(c);
    if (o.acaoPrefeito) return ACAO_FEITA[o.acaoPrefeito];
    const ap = GC.acoesPrefeito ? GC.acoesPrefeito.situacao(o.id) : '';
    if (ap) return ap;
    if (GC.estourada(o)) return `📡 Encaminhada há ${tempo(GC.idadeMin(o))} · prazo era ${tempo(o.prazoMin)} · sem equipe em campo`;
    return `📡 Encaminhada · faltam ${tempo(GC.prazoRestanteMin(o))}`;
  };

  // Botões das ações disponíveis; as telas delegam o clique por [data-acao].
  // compacto (cartões estreitos): só a ação principal leva texto, as outras só o ícone.
  const NOME_ACAO = { cobrar: 'Cobrar', priorizar: 'Priorizar', gabinete: 'Gabinete de crise' };
  const ICONE_ACAO = { cobrar: '📣', priorizar: '⚡', gabinete: '🚨' };
  // principal (listas): só a primeira ação, com verbo e destino ("Cobrar Limpeza Urbana"); as outras ficam no detalhe.
  const NOME_PRINCIPAL = { cobrar: (o) => `Cobrar ${(GC.data.areas.find((a) => a.id === o.area) || { nome: '' }).nome}`.trim(), priorizar: () => 'Priorizar', gabinete: () => 'Abrir gabinete' };
  GC.botoesAcao = function (o, { completo, compacto, principal } = {}) {
    if (principal) {
      const acao = GC.acoesDisponiveis(o)[0];
      return acao ? `<button type="button" class="btn-acao principal" data-acao="${acao}">${ICONE_ACAO[acao]} ${GC.escaparHtml ? GC.escaparHtml(NOME_PRINCIPAL[acao](o)) : NOME_PRINCIPAL[acao](o)}</button>` : '';
    }
    return GC.acoesDisponiveis(o).map((acao, i) => {
      const nome = acao === 'cobrar' && completo ? `Cobrar ${secretariaDe(o.area).nome}` : NOME_ACAO[acao];
      const classe = `btn-acao${i === 0 ? ' principal' : ''}`;
      if (compacto && i > 0) return `<button type="button" class="${classe}" data-acao="${acao}" title="${nome}" aria-label="${nome}">${ICONE_ACAO[acao]}</button>`;
      return `<button type="button" class="${classe}" data-acao="${acao}">${ICONE_ACAO[acao]} ${nome}</button>`;
    }).join('');
  };

  function secretariaDe(area) {
    const a = GC.data.areas.find((x) => x.id === area);
    return a ? a.secretaria : { nome: 'Secretaria', emoji: '🏛' };
  }

  function nomeBairro(id) {
    const b = GC.data.bairros.find((x) => x.id === id);
    return b ? b.nome : id;
  }

  // Fala simulada da secretaria integrada, por etapa do atendimento ou resposta ao prefeito.
  // A resposta à cobrança não sai daqui: é do secretário (ou da secretaria simulada, em js/app/simulacao.js).
  GC.textoSecretaria = function (ocorrencia, status, areaId) {
    const sec = secretariaDe(ocorrencia.area).nome;
    const bairro = nomeBairro(ocorrencia.bairroId);
    if (status === 'priorizada') return `${sec}: "${ocorrencia.titulo}" (${bairro}) passou para prioridade máxima. Equipe deslocada agora.`;
    if (status === 'gabinete') return `${secretariaDe(areaId).nome} confirmou presença no gabinete de crise sobre "${ocorrencia.titulo}" (${bairro}).`;
    if (status === 'em_campo') return `Equipe da ${sec} chegou ao local (${bairro}) e iniciou o atendimento.`;
    if (status === 'resolvida') return `${sec}: ocorrência resolvida no bairro ${bairro} — ${ocorrencia.titulo}. Área liberada.`;
    return `${sec} recebeu atualização sobre ${ocorrencia.titulo} (${bairro}).`;
  };

  // Toda ocorrência nasce encaminhada à secretaria, com responsável, prazo e linha do tempo.
  // disparo (ocorrência nova): { regra: retrato da regra que disparou, prazoMin e prazoSolucaoMin da regra ou null }.
  function preparar(ocorrencia, disparo = null) {
    const responsavel = ((GC.data.responsaveis || {})[ocorrencia.area] || [])[0] || 'Secretário(a) da pasta';
    const t = GC.agora() - (ocorrencia.abertaHaMin || 0) * 60000;
    const daRegra = { atendimentoMin: (disparo && disparo.prazoMin) || null, solucaoMin: (disparo && disparo.prazoSolucaoMin) || null };
    const prazos = GC.prazosIniciais(ocorrencia.severidade, daRegra);
    const emCampo = ocorrencia.status === 'em_campo';
    const o = Object.assign({}, ocorrencia, {
      status: emCampo ? 'em_campo' : 'encaminhada',
      areasEnvolvidas: (ocorrencia.areasEnvolvidas || [ocorrencia.area]).slice(),
      responsavel,
      criadaEm: t,
      prazoMin: prazos.atendimento, // atendimento: pôr equipe em campo
      prazoSolucaoMin: prazos.solucao, // solução: resolver (o do "% no prazo")
      acaoPrefeito: null,
      chegouEm: emCampo ? t : null,
      pausas: [],
      prorrogacoes: [],
      atendidoNoPrazo: emCampo ? true : null,
      resolvidaEm: null,
      noPrazo: null,
    });
    GC.registrarPrazo(o, daRegra.atendimentoMin || daRegra.solucaoMin ? 'abertura_regra' : 'abertura_gravidade', t);
    const r = disparo && disparo.regra;
    if (r) Object.assign(o, { regraId: r.id, regraVersao: r.versao, regraDisparo: r });
    o.linhaTempo = [
      { t, texto: r ? `Regra “${r.nome}”${r.versao > 1 ? ` (v${r.versao})` : ''} disparou` : 'Regra disparou automaticamente' },
      { t, texto: `Encaminhada à ${secretariaDe(o.area).nome} · responsável: ${responsavel}` },
    ];
    if (o.status === 'em_campo') o.linhaTempo.push({ t, texto: TEXTO_AVANCO.em_campo });
    return o;
  }

  GC.criarStore = function (data, opcoes = {}) {
    // Regras de alerta (js/regras-alerta.js): a do navegador ou, sem ela (testes), um registro só desta store.
    const regrasReg = opcoes.regras || GC.regrasAlerta || (GC.criarRegrasAlerta ? GC.criarRegrasAlerta() : null);
    // As ocorrências iniciais já tinham nascido: valem a gravidade e o prazo de antes de qualquer edição.
    const lista = data.ocorrencias.map((oc) => preparar(oc));
    const ouvintes = new Set();
    const base = data.indicadoresBase;
    const resolvidasDemo = []; // { o, atrasoMin, idadeMin } na ordem em que resolveram
    // Regra pausada: as ocorrências novas dela ficam retidas aqui (na memória da aba) até ela voltar.
    const retidas = new Map(); // id da regra → ocorrências que chegaram com ela pausada
    const contagens = new Map(); // id da regra → { juntadas, silenciadas } nesta aba
    let seqMedida = 0; // ids das ocorrências criadas por regra medida
    const contar = (id, k) => { const c = contagens.get(id) || { juntadas: 0, silenciadas: 0 }; c[k]++; contagens.set(id, c); };
    // Distância em metros entre duas ocorrências (aproximação plana: bairros de uma cidade).
    const distanciaM = (a, b) => {
      if (![a.lat, a.lng, b.lat, b.lng].every(Number.isFinite)) return Infinity;
      const kx = 111320 * Math.cos(((a.lat + b.lat) / 2) * Math.PI / 180);
      return Math.hypot((a.lng - b.lng) * kx, (a.lat - b.lat) * 110540);
    };

    // Pedido do cidadão que passou do limite de relatos da regra: média sobe para alta, uma vez só.
    function subirPorRelatos(o, limite, t) {
      if (!limite || o.subiuPorRelatos || o.status === 'resolvida' || (o.relatos || 0) < limite || o.severidade !== 'media') return false;
      o.severidade = 'alta';
      o.subiuPorRelatos = true;
      o.linhaTempo.push({ t, texto: `🔔 Passou de ${limite} relatos${o.regraDisparo ? ` (regra “${o.regraDisparo.nome}”)` : ''}: gravidade alta` });
      return true;
    }
    const emitir = (tipo, ocorrencia, extra) =>ouvintes.forEach((fn) => fn(Object.assign({ tipo, ocorrencia }, extra)));
    const buscar = (id) => lista.find((o) => o.id === id);
    const nomeSec = (area) => secretariaDe(area).nome;
    // Equipes da pasta (js/data-equipes.js): livre = nenhuma ocorrência aberta com ela.
    const equipesDe = (area) => (data.equipes || []).filter((e) => e.area === area);
    const ocupada = (id) => lista.some((o) => o.status !== 'resolvida' && o.equipeId === id);
    const livreDe = (area) => equipesDe(area).find((e) => !ocupada(e.id)) || null;
    // Quem já nasce em campo ocupa uma equipe da pasta (uma por equipe; as que sobram são equipe de fora).
    lista.filter((o) => o.status === 'em_campo').forEach((o) => {
      const e = livreDe(o.area);
      if (e) { o.equipeId = e.id; o.despachadaEm = o.criadaEm; }
    });

    // Fim do ciclo na pasta: a pausa aberta fecha e o pedido de mais prazo pendente é cancelado (js/prazos.js).
    function encerrarPrazo(o, t, porque) {
      const pa = GC.pausaAtual(o);
      if (pa) pa.ate = t;
      const pedido = GC.prorrogacaoPendente(o);
      if (pedido) Object.assign(pedido, { estado: 'cancelada', decididaEm: t, decididaPor: null, porque });
    }

    function mudarStatus(o, status, texto, t = GC.agora()) {
      o.status = status;
      // A cidade pondo equipe em campo sozinha: usa uma equipe livre da pasta, se houver.
      if (status === 'em_campo' && !o.equipeId) {
        const e = livreDe(o.area);
        if (e) { o.equipeId = e.id; o.despachadaEm = t; }
      }
      // Chegada ao local: o atendimento para de contar e fica registrado se foi no prazo.
      const idadeEm = GC.tempoDePrazoMin(o, t);
      if (o.status === 'em_campo' && !o.chegouEm) {
        o.chegouEm = t;
        o.atendidoNoPrazo = idadeEm <= o.prazoMin;
      }
      if (o.status === 'resolvida') {
        encerrarPrazo(o, t, 'resolvida');
        o.resolvidaEm = t;
        // "% no prazo" mede a solução (resolver dentro do prazo de solução).
        const restante = GC.prazoDe(o, t).solucao.restanteMin;
        o.noPrazo = restante >= 0;
        if (!o.chegouEm) o.atendidoNoPrazo = idadeEm <= o.prazoMin;
        resolvidasDemo.push({ o, atrasoMin: Math.max(0, Math.round(-restante)), idadeMin: GC.idadeMin(o) });
        // Resolvida por qualquer caminho: a cobrança aberta encerra junto (sem evidência, se ninguém deu).
        if (GC.cobrancas) GC.cobrancas.fecharDaOcorrencia(o.id);
      }
      o.linhaTempo.push({ t, texto: texto ? `${TEXTO_AVANCO[o.status]} · ${texto}` : TEXTO_AVANCO[o.status] });
      emitir('status', o);
      return true;
    }
    // area: id, lista de ids ou nada (lista vazia = sem filtro).
    const casaArea = (area, o) => {
      if (Array.isArray(area)) return !area.length || area.includes(o.area);
      return !area || o.area === area;
    };
    // Recorte rápido pelos números da faixa (mesma regra das contagens de kpis).
    const RECORTES = {
      criticas: (o) => o.severidade === 'critica',
      estourado: (o) => GC.estourada(o),
      andamento: (o) => o.status === 'em_campo',
    };
    // bairro: id, lista de ids ou nada (lista vazia = cidade inteira).
    const bairrosDe = (bairro) => {
      if (Array.isArray(bairro)) return bairro.length ? bairro : null;
      return bairro ? [bairro] : null;
    };
    const casaBairro = (bairro, id) => { const bs = bairrosDe(bairro); return !bs || bs.includes(id); };
    // Soma (ou média) de um valor por bairro sobre os bairros escolhidos.
    const somaBairros = (porBairro, bs) => bs.reduce((s, id) => s + (porBairro[id] || 0), 0);
    const mediaBairros = (porBairro, bs) => {
      const v = bs.map((id) => porBairro[id]).filter((x) => typeof x === 'number');
      return v.length ? Math.round(v.reduce((s, n) => s + n, 0) / v.length) : undefined;
    };
    const ativas = (area, bairro, recorte) => lista.filter((o) => o.status !== 'resolvida' && casaArea(area, o) && casaBairro(bairro, o.bairroId)
      && (!RECORTES[recorte] || RECORTES[recorte](o)));
    const media = (valores) => Math.round(valores.reduce((s, n) => s + n, 0) / valores.length);

    // Indicador próprio que cada secretaria publica, para a cidade (bairro null) ou um bairro.
    function metrica(area, bairroOuLista) {
      const def = data.basesSecretarias[area];
      const bs = bairrosDe(bairroOuLista);
      let valor;
      if (area === 'saude') {
        const ubs = data.series.lotacaoUbs.filter((u) => casaBairro(bs, u.bairroId));
        valor = ubs.length ? media(ubs.map((u) => u.pct)) : null;
      } else if (area === 'educacao') {
        const f = data.series.frequenciaEscolar;
        valor = bs ? mediaBairros(f, bs) : media(Object.values(f));
      } else {
        const h = data.historico30d[area];
        valor = bs ? somaBairros(h, bs) : Object.values(h).reduce((s, n) => s + n, 0);
      }
      return { rotulo: area === 'saude' && !bs ? 'Lotação média das UBS' : def.metrica, valor, unidade: def.unidade || '' };
    }

    const soma = (valores) => valores.reduce((s, n) => s + n, 0);
    const umaCasa = (n) => Math.round(n * 10) / 10;
    const nomeArea = (id) => data.areas.find((a) => a.id === id).nome;
    // Média ponderada pelas resolvidas; sem resolvidas (bairro sem histórico), média simples.
    const pesoMedio = (lista, campo, arredondar) => {
      const n = soma(lista.map((x) => x.resolvidas));
      return arredondar(n ? soma(lista.map((x) => x.resolvidas * x[campo])) / n : soma(lista.map((x) => x[campo])) / lista.length);
    };

    // Balanço de 30 dias: dados do mês + o que foi resolvido durante a demo.
    // Com bairro, as resolvidas são proporcionais ao histórico do bairro; % e tempo ficam os da cidade.
    // Com secretarias filtradas, resumo, frases e recentes são só delas; o ranking continua com
    // todas (noFiltro marca as escolhidas), para clicar numa linha não esvaziar a tabela.
    function desempenho(bairroOuLista, areas) {
      const bairro = bairrosDe(bairroOuLista); // null = cidade inteira
      const noFiltro = (id) => !areas || !areas.length || areas.includes(id);
      const demo = resolvidasDemo.filter((r) => casaBairro(bairro, r.o.bairroId) && noFiltro(r.o.area));
      const estouradasAgora = ativas(areas, bairro).filter(GC.estourada);
      const abertasPorArea = ativas(null, bairro);
      const atrasadasPorArea = abertasPorArea.filter(GC.estourada);
      const secretarias = data.areas.map((a) => {
        const d = data.desempenho30d[a.id];
        const hist = data.historico30d[a.id] || {};
        const total = soma(Object.values(hist));
        const base = bairro ? (total ? Math.round((d.resolvidas * somaBairros(hist, bairro)) / total) : 0) : d.resolvidas;
        const daDemo = resolvidasDemo.filter((r) => casaBairro(bairro, r.o.bairroId) && r.o.area === a.id);
        const resolvidas = base + daDemo.length;
        const noPrazo = (d.resolvidas * d.noPrazoPct) / 100 + daDemo.filter((r) => r.o.noPrazo).length;
        // Equipe em campo dentro do prazo (js/prazos.js): a base dos 30 dias mais as resolvidas na demonstração.
        const atendido = (d.resolvidas * (d.atendidoPct != null ? d.atendidoPct : d.noPrazoPct)) / 100 + daDemo.filter((r) => r.o.atendidoNoPrazo).length;
        const horas = d.resolvidas * d.tempoMedioH + soma(daDemo.map((r) => r.idadeMin / 60));
        const n = d.resolvidas + daDemo.length;
        return {
          area: a.id,
          resolvidas,
          noPrazoPct: Math.round((noPrazo / n) * 100),
          atendidoPct: Math.round((atendido / n) * 100),
          tempoMedioH: umaCasa(horas / n),
          atrasadas: atrasadasPorArea.filter((o) => o.area === a.id).length,
          abertas: abertasPorArea.filter((o) => o.area === a.id).length,
          metaPrazoPct: META_PRAZO,
          pior: false,
          noFiltro: noFiltro(a.id),
          _noPrazo: noPrazo,
          _atendido: atendido,
          _horas: horas,
          _n: n,
        };
      }).sort((x, y) => x.noPrazoPct - y.noPrazoPct);
      const escolhidas = secretarias.filter((s) => s.noFiltro);
      const pior = escolhidas[0];
      if (pior.noPrazoPct < META_PRAZO) pior.pior = true;

      // Mês anterior na mesma escala: com bairro, a mesma proporção do histórico do bairro.
      // % no prazo e tempo médio continuam os da cidade (pesos da cidade), como os do mês atual.
      const antCidade = data.areas.filter((a) => noFiltro(a.id)).map((a) => data.desempenho30d[a.id].anterior);
      const ant = data.areas.filter((a) => noFiltro(a.id)).map((a) => {
        const x = data.desempenho30d[a.id].anterior;
        if (!bairro) return x;
        const hist = data.historico30d[a.id] || {};
        const total = soma(Object.values(hist));
        return Object.assign({}, x, { resolvidas: total ? Math.round((x.resolvidas * somaBairros(hist, bairro)) / total) : 0 });
      });
      const nTotal = soma(escolhidas.map((s) => s._n));
      const resumo = {
        resolvidas: soma(escolhidas.map((s) => s.resolvidas)),
        resolvidasAnt: soma(ant.map((x) => x.resolvidas)),
        noPrazoPct: Math.round((soma(escolhidas.map((s) => s._noPrazo)) / nTotal) * 100),
        noPrazoPctAnt: pesoMedio(antCidade, 'noPrazoPct', Math.round),
        atendidoPct: Math.round((soma(escolhidas.map((s) => s._atendido)) / nTotal) * 100),
        atendidoPctAnt: pesoMedio(antCidade.map((x) => Object.assign({ atendidoPct: x.noPrazoPct }, x)), 'atendidoPct', Math.round),
        tempoMedioH: umaCasa(soma(escolhidas.map((s) => s._horas)) / nTotal),
        tempoMedioHAnt: pesoMedio(antCidade, 'tempoMedioH', umaCasa),
      };
      secretarias.forEach((s) => { delete s._noPrazo; delete s._atendido; delete s._horas; delete s._n; });

      const plural = (n) => (n === 1 ? '1 prazo estourado' : `${n} prazos estourados`);
      // Cada frase leva para onde agir: { area } filtra a secretaria, { bairro } escolhe o bairro.
      const frases = [];
      const ruim = { push: (texto, acao = null) => frases.push({ texto, acao }) };
      if (!bairro) {
        if (pior.pior) ruim.push(`${nomeArea(pior.area)}: só ${pior.noPrazoPct}% no prazo (meta ${META_PRAZO}%)`, { area: pior.area });
        // Bairro com mais prazos estourados; empate vai para o mais atrasado.
        const porBairro = {};
        estouradasAgora.forEach((o) => {
          const b = porBairro[o.bairroId] || (porBairro[o.bairroId] = { n: 0, atraso: 0 });
          b.n++;
          b.atraso += -GC.prazoRestanteMin(o);
        });
        const piorBairro = Object.entries(porBairro).sort((x, y) => y[1].n - x[1].n || y[1].atraso - x[1].atraso)[0];
        if (piorBairro) ruim.push(`${nomeBairro(piorBairro[0])}: ${plural(piorBairro[1].n)} agora`, { bairro: piorBairro[0] });
        const t = data.tendencias.filter((x) => !x.positivo && noFiltro(x.area)).sort((x, y) => Math.abs(y.variacao) - Math.abs(x.variacao))[0];
        if (t) ruim.push(`${t.rotulo}: ${t.valor}`, { area: t.area });
      } else {
        const noBairro = bairro.length === 1 ? 'no bairro' : `nos ${bairro.length} bairros`;
        if (estouradasAgora.length) ruim.push(`${plural(estouradasAgora.length)} agora ${noBairro}`);
        const casos = data.areas.filter((a) => noFiltro(a.id)).map((a) => ({ id: a.id, n: somaBairros(data.historico30d[a.id] || {}, bairro) })).sort((x, y) => y.n - x.n)[0];
        if (casos.n) ruim.push(`${nomeArea(casos.id)}: ${casos.n} casos ${noBairro} em 30 dias`, { area: casos.id });
        const sat = mediaBairros(data.satisfacaoPorBairro, bairro);
        if (sat !== undefined && sat < base.satisfacaoPct) ruim.push(`Satisfação de ${sat}% (cidade: ${base.satisfacaoPct}%)`);
      }

      const recentes = [
        ...demo.slice().reverse().map((r) => ({
          id: r.o.id, titulo: r.o.titulo, area: r.o.area, bairroId: r.o.bairroId,
          haMin: Math.round((GC.agora() - r.o.resolvidaEm) / 60000), atrasoMin: r.atrasoMin, lat: r.o.lat, lng: r.o.lng,
        })),
        ...(data.resolvidasRecentes || []).filter((r) => casaBairro(bairro, r.bairroId) && noFiltro(r.area)).map((r) => Object.assign({ id: null }, r)),
      ].slice(0, 5);

      const tres = frases.slice(0, 3);
      return { resumo, ruim: tres.map((x) => x.texto), ruimAcoes: tres.map((x) => x.acao), secretarias, recentes, escopoCidade: !!bairro };
    }

    // ---- Secretarias: status, cartões de pulso e página de cada uma ----
    const noPrazoDe = (area) => desempenho(null).secretarias.find((s) => s.area === area).noPrazoPct;

    // Crítico: prazo estourado agora ou abaixo de 70% no prazo. Atenção: abaixo da meta ou meta crítica.
    function statusSecretaria(area) {
      const pct = noPrazoDe(area);
      if (ativas(area).some(GC.estourada) || pct < 70) return 'critico';
      const metas = ((data.secretarias || {})[area] || {}).metas || [];
      if (pct < META_PRAZO || metas.some((m) => m.status === 'critico')) return 'atencao';
      return 'em_dia';
    }

    function formatarNivel(valor, unidade) {
      if (unidade === 'min') return `${valor} min`;
      if (unidade === '%') return `${valor}%`;
      return valor.toLocaleString('pt-BR');
    }

    function pulsoDe(area) {
      const s = data.secretarias[area];
      const t = data.tendencias.find((x) => x.area === area && x.rotulo === s.tendencia);
      return {
        area,
        rotulo: s.pulsoRotulo,
        nivel: formatarNivel(s.serie.meses[11], s.serie.unidade),
        // Em indicadores de %, a variação é em pontos percentuais (tendencias guarda o nível em valor).
        variacao: `${t.variacao > 0 ? '+' : ''}${t.variacao}${s.serie.unidade === '%' ? ' p.p.' : '%'}`,
        periodo: /trimestre/i.test(t.rotulo) ? 'no trimestre' : 'no mês',
        positivo: t.positivo,
        status: statusSecretaria(area),
        fonte: s.fonte,
      };
    }

    // Com bairro, o cartão mostra o indicador da secretaria no bairro (30 dias) contra a referência:
    // em % a média da cidade; em contagens, a média por bairro (na mesma quantidade de bairros).
    const ROTULO_BAIRRO = {
      infraestrutura: 'Casos de energia/obras', defesa_civil: 'Alagamentos e riscos', saude: 'Lotação das UBS',
      educacao: 'Frequência escolar', seguranca: 'Casos de segurança', mobilidade: 'Casos de trânsito', limpeza: 'Atrasos de coleta',
    };
    function pulsoNoBairro(area, bs) {
      const p = pulsoDe(area);
      const noBairro = metrica(area, bs);
      const cidade = metrica(area, null);
      const unidade = noBairro.unidade;
      const emPct = unidade === '%';
      const ref = emPct ? cidade.valor : Math.round((cidade.valor * bs.length) / data.bairros.length);
      const base = Object.assign({}, p, { rotulo: ROTULO_BAIRRO[area] || p.rotulo, periodo: '', escopo: 'bairro' });
      if (typeof noBairro.valor !== 'number') return Object.assign(base, { nivel: '—', variacao: 'sem dado no bairro', positivo: true, neutro: true });
      const maisEhMelhor = area === 'educacao';
      const v = noBairro.valor;
      return Object.assign(base, {
        nivel: formatarNivel(v, unidade),
        variacao: `${emPct ? 'cidade' : 'média'} ${formatarNivel(ref, unidade)}`,
        positivo: maisEhMelhor ? v >= ref : v <= ref,
      });
    }

    function pulsos(bairroOuLista) {
      const bs = bairrosDe(bairroOuLista);
      return data.areas.map((a) => (bs ? pulsoNoBairro(a.id, bs) : pulsoDe(a.id)));
    }

    // Onde uma secretaria mais trabalha: bairros com mais casos em 30 dias e o que está aberto agora.
    function bairrosDaSecretaria(area, limite = 5) {
      const hist = data.historico30d[area] || {};
      return data.bairros.map((b) => ({ bairroId: b.id, nome: b.nome, casos: hist[b.id] || 0, abertas: ativas(area, b.id).length }))
        .filter((x) => x.casos || x.abertas)
        .sort((x, y) => y.casos - x.casos || y.abertas - x.abertas)
        .slice(0, limite);
    }

    // Tudo o que a página de uma secretaria mostra; área inválida devolve null.
    function paginaSecretaria(area) {
      const a = data.areas.find((x) => x.id === area);
      const s = (data.secretarias || {})[area];
      if (!a || !s) return null;
      const pct = noPrazoDe(area);
      const alertas = ativas(area).slice().sort((x, y) =>
        (GC.motivosAtencao(y).length > 0) - (GC.motivosAtencao(x).length > 0)
        || PESO[x.severidade] - PESO[y.severidade]
        || GC.idadeMin(y) - GC.idadeMin(x));
      return {
        area,
        secretaria: a.secretaria,
        titular: s.titular,
        orcamento: s.orcamento,
        status: statusSecretaria(area),
        base: { fonte: `Base da ${a.secretaria.nome}`, atualizadoHaMin: data.basesSecretarias[area].atualizadoHaMin },
        pulso: pulsoDe(area),
        indicadores: [...s.indicadores, { rotulo: '% no prazo (30 dias)', valor: `${pct}%`, variacao: `meta ${META_PRAZO}%`, bom: pct >= META_PRAZO }],
        serie: s.serie,
        meses: data.mesesSerie,
        metas: s.metas,
        unidades: s.unidades,
        alertas,
      };
    }

    // Solta as retidas de regras que voltaram a valer (retomada, pausa vencida, regra excluída).
    function liberar() {
      let n = 0;
      [...retidas.entries()].forEach(([id, fila]) => {
        const r = regrasReg.buscar(id);
        if (r && !r.ativa) return;
        retidas.delete(id);
        fila.forEach((oc) => { if (api.adicionar(oc)) n++; });
      });
      return n;
    }
    // Toda mudança nas regras (aqui ou em outra aba) avisa quem desenha e solta o que voltou a valer.
    if (regrasReg) regrasReg.assinar(() => { emitir('regra', null); liberar(); });

    const api = {
      buscar,
      desempenho,
      statusSecretaria,
      pulsos,
      bairrosDaSecretaria,
      paginaSecretaria,
      ocorrencias: ativas,

      // Ação do prefeito numa exceção: cobrar, priorizar ou gabinete de crise.
      // A cobrança vira registro em GC.cobrancas, à espera da resposta da secretaria; as outras ficam em acaoPrefeito.
      agir(id, tipo) {
        const o = buscar(id);
        if (!o || !GC.acoesDisponiveis(o).includes(tipo)) return false;
        if (tipo === 'cobrar') {
          const u = GC.usuarioAtual ? GC.usuarioAtual() : null;
          if (!GC.cobrancas || !GC.cobrancas.cobrar(o, { usuarioId: u ? u.id : null, quem: u ? u.nome : 'Prefeito(a)' }).ok) return false;
          o.linhaTempo.push({ t: GC.agora(), texto: `📣 Prefeito cobrou a ${secretariaDe(o.area).nome}` });
          emitir('acao', o, { acao: tipo });
          return true;
        }
        o.acaoPrefeito = tipo;
        o.acoesFeitas = [...GC.acoesFeitas(o).filter((x) => x !== tipo), tipo];
        o.acaoEm = GC.agora();
        let texto;
        if (tipo === 'priorizar') {
          // O tempo que ainda falta cai pela metade nos dois prazos (js/prazos.js; fica no histórico do prazo).
          GC.encurtarPrazos(o);
          texto = '⚡ Prefeito priorizou';
        } else texto = `🚨 Gabinete de crise: ${o.areasEnvolvidas.map((a) => secretariaDe(a).nome).join(' + ')}`;
        o.linhaTempo.push({ t: GC.agora(), texto });
        emitir('acao', o, { acao: tipo });
        return true;
      },

      avancar(id) {
        const o = buscar(id);
        if (!o || o.status === 'resolvida') return false;
        return mudarStatus(o, GC.STATUS[GC.STATUS.indexOf(o.status) + 1]);
      },

      // Encerramento pela secretaria (cobrança com evidência ou operação da pasta): vai direto para resolvida.
      // evidencia: { foto, quem, t } opcionais; o texto é a descrição do que foi feito.
      resolver(id, texto, evidencia = {}) {
        const o = buscar(id);
        if (!o || o.status === 'resolvida') return false;
        if (texto) o.evidencia = { texto, foto: evidencia.foto || null, quem: evidencia.quem || null, t: evidencia.t || GC.agora() };
        return mudarStatus(o, 'resolvida', texto, evidencia.t || GC.agora());
      },

      // ---- operação da pasta (js/operacao.js) ----
      // Despacha uma equipe livre da pasta para uma ocorrência que ainda não tem equipe.
      despachar(id, equipeId, t = GC.agora()) {
        const o = buscar(id);
        const e = (data.equipes || []).find((x) => x.id === equipeId);
        if (!o || !e || o.status !== 'encaminhada' || o.equipeId || e.area !== o.area || ocupada(e.id)) return false;
        o.equipeId = e.id;
        o.despachadaEm = t;
        o.despachoManual = true; // a cidade não anda sozinha com esta: é do secretário
        o.linhaTempo.push({ t, texto: `🚐 ${e.nome} despachada` });
        emitir('operacao', o, { acao: 'despachar' });
        return true;
      },
      // A equipe despachada chegou ao local.
      chegar(id, t = GC.agora()) {
        const o = buscar(id);
        if (!o || o.status !== 'encaminhada' || !o.equipeId) return false;
        return mudarStatus(o, 'em_campo', `${GC.nomeEquipe ? GC.nomeEquipe(o.equipeId) : 'equipe'} chegou ao local`, t);
      },
      // Veio para a pasta errada: passa para a certa, volta a encaminhada e solta a equipe. O prazo segue
      // contando desde a abertura. A cobrança aberta encerra (a outra pasta é que vai responder).
      devolver(id, para, motivo, t = GC.agora()) {
        const o = buscar(id);
        if (!o || o.status === 'resolvida' || !para || para === o.area || !GC.data.areas.some((a) => a.id === para) || !String(motivo || '').trim()) return false;
        const de = o.area;
        o.area = para;
        o.areasEnvolvidas = [para, ...o.areasEnvolvidas.filter((a) => a !== de && a !== para)];
        o.responsavel = ((data.responsaveis || {})[para] || [])[0] || 'Secretário(a) da pasta';
        o.status = 'encaminhada';
        o.equipeId = null;
        o.despachadaEm = null;
        o.despachoManual = false;
        o.chegouEm = null; // volta a esperar equipe: o atendimento conta de novo (desde a abertura)
        o.atendidoNoPrazo = null;
        encerrarPrazo(o, t, 'devolvida');
        GC.reiniciarNaDevolucao(o, de, t);
        o.devolucoes = (o.devolucoes || []).concat({ de, para, motivo: String(motivo).trim(), t });
        if (GC.cobrancas) GC.cobrancas.fecharDaOcorrencia(o.id, `devolvida à ${nomeSec(para)}`);
        o.linhaTempo.push({ t, texto: `↩ Devolvida pela ${nomeSec(de)} à ${nomeSec(para)}: ${String(motivo).trim()}` });
        emitir('operacao', o, { acao: 'devolver', de });
        return true;
      },
      // O secretário delega a um diretor de unidade da pasta (js/data-usuarios.js, nivel 'unidade'); null devolve à
      // secretaria. O diretor passa a operar e responder a cobrança dela (js/perfil.js).
      delegar(id, usuarioId, t = GC.agora()) {
        const o = buscar(id);
        if (!o || o.status === 'resolvida') return false;
        const u = usuarioId ? (data.usuarios || GC.data.usuarios || []).find((x) => x.id === usuarioId) : null;
        if (usuarioId && (!u || u.perfil !== 'setor' || u.area !== o.area || GC.nivelDe(u) !== 'unidade' || u.ativo === false)) return false;
        if ((o.delegadoA || null) === (usuarioId || null)) return false;
        o.delegadoA = usuarioId || null;
        o.delegadaEm = usuarioId ? t : null;
        o.linhaTempo.push({ t, texto: u ? `👤 Delegada a ${u.nome} (${u.unidade})` : '👤 Voltou para o secretário' });
        emitir('operacao', o, { acao: 'delegar' });
        return true;
      },
      // ---- Prazos, fase 2 (js/prazos.js; spec docs/specs/2026-11-12-vila-dourada-prazos-fase2-design.md) ----
      // Pausa: o relógio do prazo para (os dois prazos) até retomar. Não apaga estouro que já havia.
      pausar(id, { motivo, texto = '', quem = null } = {}, t = GC.agora()) {
        const o = buscar(id);
        const txt = String(texto || '').trim();
        if (!o || o.status === 'resolvida' || GC.pausaAtual(o) || !GC.MOTIVOS_PAUSA[motivo] || (motivo === 'outro' && !txt)) return false;
        o.pausas = [...(o.pausas || []), { desde: t, ate: null, motivo, texto: txt, quem }];
        o.linhaTempo.push({ t, texto: `⏸ Prazo pausado: ${GC.MOTIVOS_PAUSA[motivo]}${txt ? ` · ${txt}` : ''}` });
        emitir('prazo', o, { acao: 'pausar' });
        return true;
      },
      retomar(id, { quem = null } = {}, t = GC.agora()) {
        const o = buscar(id);
        const pa = o && GC.pausaAtual(o);
        if (!pa || o.status === 'resolvida') return false;
        pa.ate = t;
        pa.retomadaPor = quem;
        o.linhaTempo.push({ t, texto: `▶ Prazo retomado (ficou pausado ${tempo(Math.max(1, (t - pa.desde) / 60000))})` });
        emitir('prazo', o, { acao: 'retomar' });
        return true;
      },
      // A pasta pede mais tempo na fase que está correndo. Até o limite livre da gravidade (uma vez), vale na
      // hora; senão espera o prefeito. Devolve o pedido ou false.
      prorrogar(id, { minutos, motivo, quem = null } = {}, t = GC.agora()) {
        const o = buscar(id);
        const min = Math.round(Number(minutos));
        const txt = String(motivo || '').trim();
        if (!o || o.status === 'resolvida' || GC.prorrogacaoPendente(o) || !(min >= 10 && min <= 30 * 1440) || !txt) return false;
        const p = { id: `pr-${t}-${(o.prorrogacoes || []).length + 1}`, fase: GC.faseCorrendo(o), minutos: min, motivo: txt, quem, em: t,
          estado: GC.estadoNovaProrrogacao(o, min), decididaEm: null, decididaPor: null };
        o.prorrogacoes = [...(o.prorrogacoes || []), p];
        if (p.estado === 'automatica') {
          p.decididaEm = t;
          GC.aplicarProrrogacao(o, p, t);
          o.linhaTempo.push({ t, texto: `⏳ A secretaria prorrogou: mais ${tempo(min)} para ${GC.FASES_PRAZO[p.fase]} · ${txt}` });
        } else o.linhaTempo.push({ t, texto: `⏳ A secretaria pediu mais ${tempo(min)} para ${GC.FASES_PRAZO[p.fase]} · ${txt} · aguarda o prefeito` });
        emitir('prazo', o, { acao: 'prorrogar', estado: p.estado });
        return p;
      },
      decidirProrrogacao(id, aprovar, { quem = null } = {}, t = GC.agora()) {
        const o = buscar(id);
        const p = o && o.status !== 'resolvida' ? GC.prorrogacaoPendente(o) : null;
        if (!p) return false;
        Object.assign(p, { estado: aprovar ? 'aprovada' : 'recusada', decididaEm: t, decididaPor: quem });
        if (aprovar) GC.aplicarProrrogacao(o, p, t);
        o.linhaTempo.push({ t, texto: aprovar ? `✅ Prefeito aprovou mais ${tempo(p.minutos)} para ${GC.FASES_PRAZO[p.fase]}` : `✕ Prefeito recusou mais prazo: vale o prazo de antes` });
        emitir('prazo', o, { acao: 'decidir', aprovado: !!aprovar });
        return true;
      },

      // A duplicada fecha (sem contar nos indicadores de prazo) e a principal soma os afetados.
      // ---- gestos do gabinete que mudam a ocorrência (js/acoes-prefeito.js, viajam pelo registro da operação) ----
      // Definir a pasta responsável: o prefeito arbitra. Para outra pasta, ela vai como numa devolução (o atendimento
      // recomeça lá); para a mesma, só trava. Com a pasta definida, a secretaria não devolve mais (GC.podeOperar).
      definirPasta(id, para, motivo, quem = 'Prefeito(a)', t = GC.agora()) {
        const o = buscar(id);
        if (!o || o.status === 'resolvida' || !GC.data.areas.some((a) => a.id === para) || !String(motivo || '').trim()) return false;
        const de = o.area;
        if (para !== de) {
          o.area = para;
          o.areasEnvolvidas = [para, ...o.areasEnvolvidas.filter((a) => a !== de && a !== para)];
          o.responsavel = ((data.responsaveis || {})[para] || [])[0] || 'Secretário(a) da pasta';
          o.status = 'encaminhada';
          o.equipeId = null;
          o.despachadaEm = null;
          o.despachoManual = false;
          o.chegouEm = null;
          o.atendidoNoPrazo = null;
          encerrarPrazo(o, t, 'pasta definida');
          GC.reiniciarNaDevolucao(o, de, t);
          if (GC.cobrancas) GC.cobrancas.fecharDaOcorrencia(o.id, `o prefeito passou à ${nomeSec(para)}`);
        }
        o.pastaDefinida = { area: para, de, motivo: String(motivo).trim(), quem, t };
        o.linhaTempo.push({ t, texto: para === de ? `🧭 O prefeito definiu: é da ${nomeSec(para)} (${String(motivo).trim()})` : `🧭 O prefeito passou da ${nomeSec(de)} à ${nomeSec(para)}: ${String(motivo).trim()}` });
        emitir('operacao', o, { acao: 'definir_pasta', de });
        return true;
      },
      // Reabrir uma resolvida: volta à mesma pasta, sem equipe; o prazo de solução continua contando da abertura.
      reabrir(id, motivo, texto = '', quem = 'Prefeito(a)', t = GC.agora()) {
        const o = buscar(id);
        if (!o || o.status !== 'resolvida' || o.duplicadaDe || !String(motivo || '').trim()) return false;
        const i = resolvidasDemo.findIndex((r) => r.o === o);
        if (i >= 0) resolvidasDemo.splice(i, 1);
        o.reaberturas = (o.reaberturas || []).concat({ motivo, texto: String(texto || '').trim(), quem, t, evidenciaAnterior: o.evidencia || null, falsoAlarmeAnterior: o.falsoAlarme || null });
        o.status = 'encaminhada';
        o.resolvidaEm = null;
        o.noPrazo = null;
        o.evidencia = null;
        o.falsoAlarme = null;
        o.equipeId = null;
        o.despachadaEm = null;
        o.despachoManual = false;
        o.linhaTempo.push({ t, texto: `🔓 Reaberta pelo prefeito: ${(GC.MOTIVOS_REABRIR || {})[motivo] || motivo}${texto ? ` · ${String(texto).trim()}` : ''}` });
        emitir('operacao', o, { acao: 'reabrir' });
        return true;
      },
      // Falso alarme: fecha sem contar como resolvida (fora do "% no prazo") e conta contra a regra que disparou.
      // Pedido de morador (o.pontoId) não é falso alarme: alguém viu o problema.
      falsoAlarme(id, motivo, texto = '', quem = 'Prefeito(a)', t = GC.agora()) {
        const o = buscar(id);
        if (!o || o.status === 'resolvida' || o.pontoId || !String(motivo || '').trim()) return false;
        encerrarPrazo(o, t, 'falso alarme');
        o.status = 'resolvida';
        o.resolvidaEm = t;
        o.noPrazo = null;
        o.falsoAlarme = { motivo, texto: String(texto || '').trim(), quem, t, regraId: o.regraId || o.tipo };
        if (GC.cobrancas) GC.cobrancas.fecharDaOcorrencia(o.id, 'marcada como falso alarme');
        o.linhaTempo.push({ t, texto: `🚫 Falso alarme: ${(GC.MOTIVOS_FALSO_ALARME || {})[motivo] || motivo}${texto ? ` · ${String(texto).trim()}` : ''}` });
        emitir('operacao', o, { acao: 'falso_alarme' });
        return true;
      },

      juntar(id, principalId, t = GC.agora()) {
        const o = buscar(id);
        const p = buscar(principalId);
        if (!o || !p || o === p || o.status === 'resolvida' || p.status === 'resolvida' || o.area !== p.area) return false;
        encerrarPrazo(o, t, 'juntada');
        o.status = 'resolvida';
        o.resolvidaEm = t;
        o.noPrazo = null;
        o.duplicadaDe = p.id;
        p.afetados = (p.afetados || 0) + (o.afetados || 0);
        if (GC.cobrancas) GC.cobrancas.fecharDaOcorrencia(o.id, `juntada a "${p.titulo}"`);
        o.linhaTempo.push({ t, texto: `🔗 Juntada a "${p.titulo}" (duplicada)` });
        p.linhaTempo.push({ t, texto: `🔗 Recebeu a duplicada "${o.titulo}"` });
        emitir('operacao', o, { acao: 'juntar', principal: p.id });
        return true;
      },

      // ---- pedidos do cidadão (js/pedidos.js) ----
      // O ponto do portal vira ocorrência: nasce média (prazos da gravidade média), sem passar pelo silêncio nem pela pausa
      // da regra (pedido de morador não fica retido), com o retrato da regra do tipo. limite: relatos que fazem subir.
      doPedido(ocorrencia, limite = null) {
        if (buscar(ocorrencia.id)) return null;
        const regra = regrasReg ? regrasReg.paraOcorrencia(ocorrencia) : null;
        const o = preparar(Object.assign({}, ocorrencia, { severidade: 'media', areasEnvolvidas: [ocorrencia.area] }),
          regra ? { regra: regrasReg.retrato(regra), prazoMin: null, prazoSolucaoMin: null } : null);
        o.linhaTempo[0] = { t: o.criadaEm, texto: `💬 Pedido de morador pelo portal (${o.relatos || 1} relato${(o.relatos || 1) > 1 ? 's' : ''})` };
        lista.push(o);
        subirPorRelatos(o, limite, GC.agora());
        emitir('nova', o);
        return o;
      },
      // Mais moradores relataram o mesmo problema: atualiza o contador e, ao passar do limite da regra, sobe uma vez.
      relatos(id, n, limite = null, pontoId = null) {
        const o = buscar(id);
        if (!o || !Number.isFinite(n) || (o.relatos === n && (!pontoId || o.pontoId === pontoId))) return false;
        const antes = o.relatos || 0;
        o.relatos = n;
        if (pontoId) o.pontoId = pontoId;
        o.afetados = Math.max(o.afetados || 0, n);
        if (n > antes && antes) o.linhaTempo.push({ t: GC.agora(), texto: `💬 Mais ${n - antes} morador${n - antes > 1 ? 'es' : ''} relatou o problema (${n} no total)` });
        subirPorRelatos(o, limite, GC.agora());
        emitir('relatos', o);
        return true;
      },

      // A cidade anda sozinha: avança a ocorrência comum mais antiga (nunca uma exceção
      // nem uma que o prefeito já tocou) e para quando restam poucas ativas.
      passoAutomatico() {
        const at = ativas();
        if (at.length <= MAX_AUTOMATICO) return null;
        const alvo = at
          .filter((o) => !o.acaoPrefeito && !o.despachoManual && !cobrancaDe(o) && !GC.motivosAtencao(o).length
            && !(GC.acoesPrefeito && GC.acoesPrefeito.daOcorrencia(o.id).length))
          .sort((a, b) => GC.idadeMin(b) - GC.idadeMin(a))[0];
        if (!alvo) return null;
        this.avancar(alvo.id);
        return alvo.id;
      },

      // A regra que vale para a ocorrência dá gravidade e prazo. Pausada: devolve false e a ocorrência
      // fica retida, sem evento.
      adicionar(ocorrencia) {
        // Disparo medido (fase 4): a regra que mediu é a que vale, mesmo que outra do tipo fosse a mais específica.
        const regra = !regrasReg ? null
          : ocorrencia.regraMedidaId ? regrasReg.buscar(ocorrencia.regraMedidaId) : regrasReg.paraOcorrencia(ocorrencia);
        if (regra && !regra.ativa) {
          if (!retidas.has(regra.id)) retidas.set(regra.id, []);
          retidas.get(regra.id).push(ocorrencia);
          return false;
        }
        // Silêncio da regra: repetida perto de uma aberta da mesma regra é juntada a ela; dentro do intervalo
        // no mesmo bairro, o disparo é só registrado na anterior. Nos dois casos não nasce alerta novo.
        const sl = regra && regra.silencio;
        if (sl && (sl.juntarRaioM || sl.intervaloMin)) {
          const t = GC.agora();
          const daRegra = lista.filter((x) => x.regraId === regra.id && x.id !== ocorrencia.id);
          const perto = sl.juntarRaioM && daRegra.filter((x) => x.status !== 'resolvida' && distanciaM(x, ocorrencia) <= sl.juntarRaioM)
            .sort((a, b) => distanciaM(a, ocorrencia) - distanciaM(b, ocorrencia))[0];
          if (perto) {
            perto.afetados = (perto.afetados || 0) + (ocorrencia.afetados || 0);
            perto.repetidas = (perto.repetidas || 0) + 1;
            perto.linhaTempo.push({ t, texto: `🔗 Novo disparo a ${Math.round(distanciaM(perto, ocorrencia))} m juntado aqui (regra “${regra.nome}”)` });
            contar(regra.id, 'juntadas');
            emitir('juntada', perto, { de: ocorrencia.id });
            return true;
          }
          const recente = sl.intervaloMin && daRegra.filter((x) => x.bairroId === ocorrencia.bairroId && (t - x.criadaEm) / 60000 < sl.intervaloMin)
            .sort((a, b) => b.criadaEm - a.criadaEm)[0];
          if (recente) {
            recente.repetidas = (recente.repetidas || 0) + 1;
            recente.linhaTempo.push({ t, texto: `🔕 Novo disparo no bairro silenciado (intervalo de ${tempo(sl.intervaloMin)} da regra “${regra.nome}”)` });
            contar(regra.id, 'silenciadas');
            emitir('juntada', recente, { de: ocorrencia.id, silenciada: true });
            return true;
          }
        }
        const ajuste = regra ? regrasReg.aplicar(regra, ocorrencia) : null;
        const o = preparar(Object.assign({}, ocorrencia, { status: 'encaminhada' }, ajuste ? { severidade: ajuste.severidade } : {}),
          regra ? { regra: regrasReg.retrato(regra), prazoMin: ajuste.prazoMin, prazoSolucaoMin: ajuste.prazoSolucaoMin } : null);
        if (regra) regrasReg.contarDisparo(regra.id);
        lista.push(o);
        emitir('nova', o);
        return true;
      },

      // Regras que disparam sozinhas (fase 4): cada alvo que passa das condições vira um alerta, pelo
      // adicionar (gravidade, prazo, silêncio e escalonamento da regra valem). Não repete enquanto houver
      // aberta do mesmo alvo, nem quando a cidade já tem aberta do mesmo tipo no bairro (ou a do próprio alvo).
      // Devolve as ocorrências criadas.
      avaliarRegras() {
        if (!regrasReg || !regrasReg.avaliarMedidas) return [];
        const abertas = lista.filter((o) => o.status !== 'resolvida');
        const criadas = [];
        regrasReg.avaliarMedidas().forEach(({ regra, alvo, fonte }) => {
          const chave = `${regra.id}|${alvo.id}`;
          if (abertas.some((o) => o.alvoMedido === chave || (alvo.ocorrenciaId && o.id === alvo.ocorrenciaId)
            || (o.tipo === regra.tipo && o.bairroId === alvo.bairroId))) return;
          // Resolvida há pouco: os dados simulados não mudam sozinhos, então o mesmo alvo só volta a disparar
          // depois de REARME_MEDIDA_MIN (senão renasceria a cada passo da cidade).
          if (lista.some((o) => o.alvoMedido === chave && o.resolvidaEm && (GC.agora() - o.resolvidaEm) / 60000 < REARME_MEDIDA_MIN)) return;
          seqMedida += 1;
          const valores = GC.valoresEmPalavras(regra, alvo);
          const oc = {
            id: `med-${seqMedida}-${String(alvo.id).replace(/[^a-z0-9_-]/gi, '')}`,
            // A pasta é a do alvo quando a fonte a conhece (entrega em risco: a pasta da obra), senão a da regra.
            area: alvo.area || regra.area, tipo: regra.tipo, titulo: `${regra.nome}: ${alvo.nome}`,
            bairroId: alvo.bairroId, lat: alvo.lat, lng: alvo.lng,
            severidade: regra.gravidade.base || 'alta', afetados: alvo.afetados || 0,
            areasEnvolvidas: [alvo.area || regra.area], abertaHaMin: 0,
            fonte: `Medição automática · ${GC.FONTES_MEDIDAS[fonte].nome}`,
            regraMedidaId: regra.id, alvoMedido: chave,
            medicao: { alvo: alvo.nome, fonte: GC.FONTES_MEDIDAS[fonte].nome, valores },
          };
          if (api.adicionar(oc)) {
            const o = buscar(oc.id);
            if (o) { abertas.push(o); criadas.push(o); }
          }
        });
        return criadas;
      },

      // A regra que valeria para a ocorrência (null = nenhuma do tipo).
      regraPara: (ocorrencia) => (regrasReg ? regrasReg.paraOcorrencia(ocorrencia) : null),
      regrasAlerta: regrasReg,
      // Pausa que venceu (ou retomada em outra aba): solta as retidas. Devolve quantas entraram.
      sincronizarRegras: () => liberar(),

      todas: () => lista.slice(),

      // Regras efetivas (padrão + mudanças do usuário + criadas) com as retidas desta aba.
      regras() {
        if (!regrasReg) return [];
        return regrasReg.efetivas().map((r) => Object.assign(r, { retidas: (retidas.get(r.id) || []).length, nova: r.origem === 'maia' },
          contagens.get(r.id) || { juntadas: 0, silenciadas: 0 }));
      },

      // Pausa até reativar ou reativa (a chave da Central); as retidas entram na ordem em que chegaram.
      alternarRegra(id) {
        const r = regrasReg && regrasReg.buscar(id);
        if (!r || r.rascunho) return false;
        return (r.pausa ? regrasReg.retomar(id) : regrasReg.pausar(id, null)).ok;
      },

      // Regra da Maia ("Transformar em alerta"): vira rascunho, que não dispara até alguém revisar.
      criarRegra({ nome, expressao, fontes, area }) {
        if (!regrasReg) return { id: null, criada: false };
        const r = regrasReg.criar({ origem: 'maia', nome, expressao, fontes, area });
        return r.ok ? { id: r.regra.id, criada: r.criada } : { id: null, criada: false };
      },

      // "Precisam da sua atenção": só exceções. Ordem: o que o prefeito ainda não tocou primeiro;
      // depois a gravidade (UTI lotada antes de lixo atrasado, mesmo que o lixo esteja mais atrasado),
      // o motivo (prazo, conjunta, recorrente), o mais estourado e a mais antiga.
      atencao(areas, bairro, recorte) {
        const todas = ativas(areas, bairro, recorte)
          .map((o) => ({ o, m: GC.motivosAtencao(o) }))
          .filter((x) => x.m.length)
          .sort((a, b) => (GC.tratada(a.o) - GC.tratada(b.o))
            || PESO[a.o.severidade] - PESO[b.o.severidade]
            || ORDEM_MOTIVO[a.m[0].tipo] - ORDEM_MOTIVO[b.m[0].tipo]
            || (a.m[0].tipo === 'prazo' ? GC.prazoRestanteMin(a.o) - GC.prazoRestanteMin(b.o) : 0)
            || GC.idadeMin(b.o) - GC.idadeMin(a.o))
          .map((x) => x.o);
        return { cartoes: todas.slice(0, 3), todas };
      },

      kpis(area, bairro) {
        const at = ativas(area, bairro);
        return {
          criticas: at.filter((o) => o.severidade === 'critica').length,
          estouradas: at.filter(GC.estourada).length,
          emAndamento: at.filter((o) => o.status === 'em_campo').length,
          satisfacaoPct: bairrosDe(bairro) ? mediaBairros(data.satisfacaoPorBairro, bairrosDe(bairro)) : base.satisfacaoPct,
          noPrazoPct: desempenho(bairro).resumo.noPrazoPct,
          tempoMedioH: desempenho(bairro).resumo.tempoMedioH,
        };
      },

      // Um bloco por secretaria: ocorrências ativas dela + indicador da base dela.
      porSecretaria(bairro, areas) {
        return data.areas.filter((a) => !areas || !areas.length || areas.includes(a.id)).map((a) => {
          const at = ativas(a.id, bairro);
          return {
            area: a.id,
            secretaria: a.secretaria,
            ativas: at.length,
            criticas: at.filter((o) => o.severidade === 'critica').length,
            metrica: metrica(a.id, bairro),
            fonte: `Base da ${a.secretaria.nome}`,
            atualizadoHaMin: data.basesSecretarias[a.id].atualizadoHaMin,
          };
        });
      },

      // Desfazer (js/desfazer.js): a cópia da ocorrência antes da ação e a volta a ela. A volta troca os campos no
      // mesmo objeto (quem guarda a referência continua valendo) e emite 'restaurada', não 'status': nada de fala
      // da secretaria nem de aviso por uma ação que não aconteceu.
      retrato(id) {
        const o = buscar(id);
        return o ? JSON.parse(JSON.stringify(o)) : null;
      },
      restaurar(id, retrato) {
        const o = buscar(id);
        if (!o || !retrato || retrato.id !== id) return false;
        Object.keys(o).forEach((k) => { delete o[k]; });
        Object.assign(o, JSON.parse(JSON.stringify(retrato)));
        // Deixou de estar resolvida: sai da conta das resolvidas (desempenho, "% no prazo").
        if (o.status !== 'resolvida') {
          for (let i = resolvidasDemo.length - 1; i >= 0; i--) if (resolvidasDemo[i].o === o) resolvidasDemo.splice(i, 1);
        }
        emitir('restaurada', o);
        return true;
      },

      assinar(fn) {
        ouvintes.add(fn);
        return () => ouvintes.delete(fn);
      },
    };
    return api;
  };
})(window.GC = window.GC || {});
