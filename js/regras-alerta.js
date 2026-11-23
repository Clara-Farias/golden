(function (GC) {
  // Regras de alerta configuráveis (spec: docs/specs/2026-11-12-vila-dourada-regras-de-alerta-design.md).
  // As 22 regras de js/data-alertas.js são o padrão de fábrica e não mudam: o registro guarda só o que o
  // usuário mudou (sobreposições), as regras criadas e as pausas, em localStorage (gc.regras.<cidade>).
  // Para cada ocorrência vale a regra mais específica do tipo (recorte de bairros vence a cidade inteira).
  const SEVS = ['critica', 'alta', 'media'];
  const PESO_SEV = { critica: 0, alta: 1, media: 2 };
  const OPERADORES = ['>', '>=', '<', '<=', '=', 'sim'];
  // Escalonamento (fase 3): depois de X minutos sem equipe em campo, a ocorrência sobe para o Gabinete ou
  // ganha o botão de cobrança pronto. A cobrança continua sendo ato do prefeito: nada é cobrado sozinho.
  GC.ACOES_ESCALONAMENTO = { avisar_gabinete: 'avisar o Gabinete do Prefeito', propor_cobranca: 'propor cobrar a secretaria' };
  const SILENCIO_VAZIO = () => ({ intervaloMin: null, juntarRaioM: null });

  // O que leva uma ocorrência a "Precisam de você" (limites da cidade, um só conjunto, mudado pelo gestor geral).
  // O padrão é o comportamento de antes desta configuração existir.
  // antecipar: o alerta entra em "Precisam de você" ao usar quasePct do prazo, antes de estourar.
  GC.ATENCAO_PADRAO = Object.freeze({ recorrenteMin: 6, recorrenteGravidades: ['critica', 'alta'], conjunta: true, quasePct: 75, antecipar: true });
  const atencaoValida = (a) => Number.isInteger(a.recorrenteMin) && a.recorrenteMin >= 1 && a.recorrenteMin <= 99
    && Array.isArray(a.recorrenteGravidades) && a.recorrenteGravidades.every((g) => SEVS.includes(g))
    && typeof a.conjunta === 'boolean' && typeof a.antecipar === 'boolean' && Number.isInteger(a.quasePct) && a.quasePct >= 10 && a.quasePct <= 99;
  GC.limitesAtencao = () => (GC.regrasAlerta ? GC.regrasAlerta.atencao() : JSON.parse(JSON.stringify(GC.ATENCAO_PADRAO)));

  const tempoCurto = (min) => (GC.tempoTexto ? GC.tempoTexto(min) : `${min} min`);
  GC.escalonamentoEmPalavras = (e) => `Se ficar ${tempoCurto(e.aposMin)} sem equipe em campo: ${GC.ACOES_ESCALONAMENTO[e.acao] || e.acao}`;
  GC.silencioEmPalavras = (sl) => [
    sl && sl.intervaloMin ? `não dispara de novo no mesmo bairro por ${tempoCurto(sl.intervaloMin)}` : '',
    sl && sl.juntarRaioM ? `junta repetidas a menos de ${sl.juntarRaioM.toLocaleString('pt-BR')} m` : '',
  ].filter(Boolean).join('; ');

  // Catálogo do que uma condição pode medir. tipo 'sim' = verdadeiro/falso (operador 'sim', sem valor).
  // Nesta fase as métricas só descrevem a regra; nenhuma é lida dos dados.
  const m = (id, nome, unidade, area, tipo = 'numero') => ({ id, nome, unidade, area, tipo });
  GC.METRICAS_ALERTA = [
    m('chuva_mm_h', 'chuva', 'mm/h', 'defesa_civil'),
    m('chuva_acumulada_72h', 'chuva acumulada em 3 dias', 'mm', 'defesa_civil'),
    m('chuva_prevista_mm', 'chuva prevista', 'mm', 'defesa_civil'),
    m('area_risco_mapeada', 'área de risco já mapeada', '', 'defesa_civil', 'sim'),
    m('chamados_156', 'chamados no 156', 'chamados', null),
    m('relatos_app', 'relatos no App Cidadão', 'relatos', null),
    m('denuncia_com_foto', 'denúncia com foto e localização', '', null, 'sim'),
    m('imoveis_sem_energia', 'imóveis sem energia', 'imóveis', 'infraestrutura'),
    m('pontos_apagados', 'postes apagados na mesma via', 'postes', 'infraestrutura'),
    m('pressao_rede_pct', 'pressão da rede de água', '%', 'infraestrutura'),
    m('ocupacao_ubs_pct', 'ocupação da unidade de saúde', '%', 'saude'),
    m('ocupacao_uti_pct', 'ocupação da UTI', '%', 'saude'),
    m('plantoes_descobertos', 'plantões sem médico', 'plantões', 'saude'),
    m('casos_vs_media_sazonal', 'casos suspeitos sobre o normal da época', '×', 'saude'),
    m('escola_sem_agua', 'escola sem abastecimento de água', '', 'educacao', 'sim'),
    m('turno_em_andamento', 'aula em andamento', '', 'educacao', 'sim'),
    m('atraso_rota_escolar_min', 'atraso do transporte escolar', 'min', 'educacao'),
    m('ocorrencias_vs_media', 'ocorrências sobre a média de 4 semanas', '×', 'seguranca'),
    m('cameras_offline', 'câmeras fora do ar', 'câmeras', 'seguranca'),
    m('semaforo_sem_sinal_min', 'semáforo sem sinal', 'min', 'mobilidade'),
    m('velocidade_media_kmh', 'velocidade média do trânsito', 'km/h', 'mobilidade'),
    m('fila_km', 'fila de carros', 'km', 'mobilidade'),
    m('viagens_atrasadas', 'viagens seguidas com mais de 20 min de atraso', 'viagens', 'mobilidade'),
    m('via_bloqueada', 'via bloqueada', '', 'mobilidade', 'sim'),
    m('veiculos_envolvidos', 'veículos envolvidos', 'veículos', 'mobilidade'),
    m('atraso_coleta_h', 'atraso da coleta', 'h', 'limpeza'),
    m('bueiro_obstruido', 'bueiro entupido', '', 'limpeza', 'sim'),
    m('afetados', 'pessoas afetadas', 'pessoas', null),
    // Fase 4: medidas nos dados simulados (fonte abaixo). As de cima que também têm fonte ganham "ler".
    m('horas_ate_limiar', 'horas até a chuva prevista passar do limite da área', 'h', 'defesa_civil'),
    m('familias_area', 'famílias na área de risco', 'famílias', 'defesa_civil'),
    m('coleta_no_prazo_pct', 'coletas no prazo na rota em 30 dias', '%', 'limpeza'),
    m('rota_atrasada', 'rota de coleta atrasada hoje', '', 'limpeza', 'sim'),
    m('espera_vs_intervalo', 'espera do passageiro sobre o intervalo da linha', '×', 'mobilidade'),
    m('linha_critica', 'linha de ônibus em situação crítica', '', 'mobilidade', 'sim'),
    m('atraso_ritmo_pp', 'pontos do feito abaixo do esperado pelo tempo da obra', 'p.p.', 'infraestrutura'),
  ];
  const metrica = (id) => GC.METRICAS_ALERTA.find((x) => x.id === id);

  // ---- Fase 4: regras que disparam sozinhas ----
  // Cada fonte lê o que os dados simulados já mostram em outras telas (js/data-<domínio>.js) e devolve os
  // alvos com bairro, posição e os valores das métricas dela. Nada é gerado só para o alerta.
  const centro = (bairroId) => ((GC.data.bairros.find((b) => b.id === bairroId) || {}).centro || [null, null]);
  const ponto = (bairroId, lat, lng) => (Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : { lat: centro(bairroId)[0], lng: centro(bairroId)[1] });
  GC.FONTES_MEDIDAS = {
    unidade_saude: {
      nome: 'leitos das unidades de saúde',
      alvos: () => (GC.leitos ? GC.leitos.resumo().unidades.map((u) => Object.assign({ id: u.id, nome: u.nome, bairroId: u.bairroId, ocorrenciaId: u.ocorrenciaId || null,
        afetados: u.ocupados || 0, valores: { ocupacao_ubs_pct: u.pct, ocupacao_uti_pct: u.utiPct } }, ponto(u.bairroId, u.lat, u.lng))) : []),
    },
    area_risco: {
      nome: 'áreas de risco e previsão de chuva',
      alvos: () => (GC.risco ? GC.risco.resumo([]).areas.map((a) => Object.assign({ id: a.id, nome: a.nome, bairroId: a.bairroId, ocorrenciaId: null,
        afetados: (a.familias || 0) * 3, valores: { horas_ate_limiar: a.horasAte, familias_area: a.familias } }, ponto(a.bairroId))) : []),
    },
    rota_coleta: {
      nome: 'rotas da coleta de lixo',
      alvos: () => (GC.coleta ? GC.coleta.resumo().rotas.filter((r) => (r.bairros || []).length).map((r) => Object.assign({ id: r.id, nome: r.nome, bairroId: r.bairros[0],
        bairros: r.bairros.slice(), ocorrenciaId: r.ocorrenciaId || null, afetados: 0,
        valores: { coleta_no_prazo_pct: r.noPrazoPct, rota_atrasada: r.status === 'atrasada' } }, ponto(r.bairros[0]))) : []),
    },
    linha_onibus: {
      nome: 'linhas de ônibus',
      alvos: () => (GC.frota ? GC.frota.resumo().linhas.filter((l) => (l.bairros || []).length).map((l) => Object.assign({ id: l.id, nome: l.nome, bairroId: l.bairros[0],
        bairros: l.bairros.slice(), ocorrenciaId: l.ocorrenciaId || null, afetados: 0,
        valores: { espera_vs_intervalo: l.razao, linha_critica: l.situacao === 'critica' } }, ponto(l.bairros[0]))) : []),
    },
  };
  // Obras ainda não entregues da agenda de entregas (js/data-entregas.js): o mesmo avanço e o mesmo esperado da
  // tela #/entregas. A pasta do alvo é a da obra (a ocorrência nasce nela, não na da regra).
  GC.FONTES_MEDIDAS.obra_entrega = {
    nome: 'avanço das obras na agenda de entregas',
    alvos: () => (GC.entregas ? GC.entregas.lista().filter((e) => e.origem.obra && e.situacao !== 'entregue' && e.esperadoPct !== null)
      .map((e) => Object.assign({ id: e.origem.obra, nome: e.titulo, bairroId: e.bairroId, area: e.area, ocorrenciaId: null, afetados: 0,
        valores: { atraso_ritmo_pp: Math.max(0, e.esperadoPct - e.avancoPct) } }, ponto(e.bairroId, e.lat, e.lng))) : []),
  };
  const FONTE_DA_METRICA = {
    ocupacao_ubs_pct: 'unidade_saude', ocupacao_uti_pct: 'unidade_saude',
    horas_ate_limiar: 'area_risco', familias_area: 'area_risco',
    coleta_no_prazo_pct: 'rota_coleta', rota_atrasada: 'rota_coleta',
    espera_vs_intervalo: 'linha_onibus', linha_critica: 'linha_onibus',
    atraso_ritmo_pp: 'obra_entrega',
  };
  GC.METRICAS_ALERTA.forEach((x) => { x.fonte = FONTE_DA_METRICA[x.id] || null; });

  // A regra dispara sozinha quando todas as condições são medidas pela mesma fonte (o mesmo alvo).
  GC.fonteDaRegra = function (regra) {
    const cs = ((regra && regra.condicoes) || []).filter((c) => c.metrica);
    if (!cs.length) return null;
    const fontes = [...new Set(cs.map((c) => (metrica(c.metrica) || {}).fonte || null))];
    return fontes.length === 1 && fontes[0] ? fontes[0] : null;
  };

  const passa = (c, v) => {
    if (c.operador === 'sim') return v === true;
    if (!Number.isFinite(v)) return false; // sem medida (ex.: a chuva não chega ao limite em 24 h)
    return { '>': v > c.valor, '>=': v >= c.valor, '<': v < c.valor, '<=': v <= c.valor, '=': v === c.valor }[c.operador] || false;
  };
  // Alvos que passam das condições agora (respeita o recorte de bairros). Pura: lê os dados na hora.
  GC.alvosQuePassam = function (regra) {
    const fonte = GC.fonteDaRegra(regra);
    if (!fonte) return [];
    const bairros = (regra.escopo && regra.escopo.bairros) || [];
    const cs = regra.condicoes.filter((c) => c.metrica);
    return GC.FONTES_MEDIDAS[fonte].alvos()
      .filter((a) => !bairros.length || (a.bairros || [a.bairroId]).some((b) => bairros.includes(b)))
      .filter((a) => {
        const ok = cs.map((c) => passa(c, a.valores[c.metrica]));
        return regra.combinar === 'OU' ? ok.some(Boolean) : ok.every(Boolean);
      })
      .map((a) => Object.assign({}, a, { bairroId: bairros.length && a.bairros ? a.bairros.find((b) => bairros.includes(b)) : a.bairroId }));
  };
  // "Transformar em alerta" da Maia: a expressão de cada tema (campo alerta de js/ia/tema-*.js) traduzida para
  // uma regra que o painel sabe medir. Com modelo, a regra já nasce ativa e disparando sozinha; sem modelo
  // (a pergunta não tem dado medido no painel), fica rascunho para alguém ligar a um tipo.
  const cnd = (metrica, operador, valor, janelaMin) => Object.assign({ metrica, operador }, valor === undefined ? {} : { valor }, janelaMin ? { janelaMin } : {});
  GC.MODELOS_ALERTA_MAIA = {
    'ocupacao_uti > 90% OU ocupacao_leitos > 85%': { tipo: 'lotação', combinar: 'OU', condicoes: [cnd('ocupacao_uti_pct', '>', 90), cnd('ocupacao_ubs_pct', '>', 85)] },
    'lotacao_ubs > 85% por 2 h': { tipo: 'lotação', condicoes: [cnd('ocupacao_ubs_pct', '>', 85, 120)] },
    'chuva_prevista_6h (+ acumulado_72h nas encostas) >= limiar_area': { tipo: 'alagamento', condicoes: [cnd('horas_ate_limiar', '<=', 6)] },
    'coleta_atrasada_bairro > 48 h': { tipo: 'coleta de lixo', condicoes: [cnd('rota_atrasada', 'sim')] },
    'disponibilidade_frota < meta_contrato OU espera_ponto > 1,8 × intervalo_programado': { tipo: 'transporte público', condicoes: [cnd('espera_vs_intervalo', '>', 1.8)] },
  };

  // Valores medidos em palavras ("ocupação da UTI: 95%"), para o título e as evidências.
  GC.valoresEmPalavras = (regra, alvo) => regra.condicoes.filter((c) => c.metrica).map((c) => {
    const mt = metrica(c.metrica);
    const v = alvo.valores[c.metrica];
    if (mt.tipo === 'sim') return `${mt.nome}: ${v ? 'sim' : 'não'}`;
    if (!Number.isFinite(v)) return `${mt.nome}: sem valor`;
    const n = Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 1 });
    return `${mt.nome}: ${n}${mt.unidade === '%' || mt.unidade === '×' ? mt.unidade : mt.unidade ? ` ${mt.unidade}` : ''}`;
  });

  // ---- texto gerado da estrutura (nunca contradiz a regra) ----
  const OP_PALAVRA = { '>': 'acima de', '>=': 'pelo menos', '<': 'abaixo de', '<=': 'no máximo', '=': 'igual a' };
  const num = (v) => Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
  function janelaTexto(min) {
    if (!min) return '';
    if (min < 60) return ` em ${min} min`;
    if (min % 1440 === 0) return min === 1440 ? ' em 24 horas' : ` em ${min / 1440} dias`;
    return min === 60 ? ' em 1 hora' : ` em ${num(min / 60)} horas`;
  }
  function condicaoEmPalavras(x) {
    const mt = metrica(x.metrica) || { nome: String(x.metrica || '').replace(/_/g, ' '), unidade: '', tipo: 'numero' };
    if (x.operador === 'sim' || mt.tipo === 'sim') return mt.nome;
    const unidade = mt.unidade === '%' ? '%' : mt.unidade === '×' ? '×' : mt.unidade ? ` ${mt.unidade}` : '';
    return `${mt.nome} ${OP_PALAVRA[x.operador] || x.operador} ${num(x.valor)}${unidade}${janelaTexto(x.janelaMin)}`;
  }
  const maiuscula = (t) => (t ? t.charAt(0).toUpperCase() + t.slice(1) : '');
  function emPalavras(regra) {
    if (!regra) return '';
    if (regra.texto) return regra.texto;
    if (!regra.condicoes || !regra.condicoes.length) return GC.regraEmPalavras ? GC.regraEmPalavras({ expressao: regra.expressao }) : '';
    return maiuscula(regra.condicoes.map(condicaoEmPalavras).join(regra.combinar === 'OU' ? ', ou ' : ' e '));
  }
  function expressao(regra) {
    if (!regra.condicoes || !regra.condicoes.length) return regra.expressaoOriginal || regra.expressao || '';
    return regra.condicoes.map((x) => (x.operador === 'sim' ? x.metrica
      : `${x.metrica} ${x.operador} ${x.valor}${x.janelaMin ? ` em ${x.janelaMin} min` : ''}`)).join(regra.combinar === 'OU' ? ' OU ' : ' E ');
  }

  // ---- validação do que o usuário (ou a Maia) manda salvar ----
  const bairroValido = (id) => ((GC.data && GC.data.bairros) || []).some((b) => b.id === id);
  const areaValida = (id) => ((GC.data && GC.data.areas) || []).some((a) => a.id === id);
  function validar(r) {
    if (!r.nome || !String(r.nome).trim() || String(r.nome).length > 120) return 'nome';
    // Rascunho da Maia ainda não tem tipo; toda regra que dispara precisa de um tipo conhecido.
    if (!r.rascunho && !(r.tipo && GC.data.regras[r.tipo])) return 'tipo';
    if (!r.rascunho && !r.condicoes.length) return 'condicao';
    if (r.area !== null && r.area !== undefined && !areaValida(r.area)) return 'area';
    if (!Array.isArray(r.escopo.bairros) || !r.escopo.bairros.every(bairroValido)) return 'bairros';
    if (!['E', 'OU'].includes(r.combinar)) return 'combinar';
    for (const x of r.condicoes) {
      const mt = metrica(x.metrica);
      if (!mt || !OPERADORES.includes(x.operador)) return 'condicao';
      if (mt.tipo === 'sim' ? x.operador !== 'sim' : (x.operador === 'sim' || !Number.isFinite(Number(x.valor)))) return 'condicao';
      if (x.janelaMin !== undefined && !(Number.isInteger(x.janelaMin) && x.janelaMin > 0)) return 'condicao';
    }
    if (r.gravidade.base !== null && !SEVS.includes(r.gravidade.base)) return 'gravidade';
    for (const s of r.gravidade.sobe) {
      if (!metrica(s.metrica) || !OPERADORES.includes(s.operador) || s.operador === 'sim' || !Number.isFinite(Number(s.valor)) || !SEVS.includes(s.para)) return 'gravidade';
    }
    if (r.prazoMin !== null && !(Number.isInteger(r.prazoMin) && r.prazoMin >= 10 && r.prazoMin <= 30 * 1440)) return 'prazo';
    // Prazo para resolver (js/prazos.js): de 1 h a 90 dias e nunca menor que o de pôr equipe em campo.
    if (r.prazoSolucaoMin != null && (!(Number.isInteger(r.prazoSolucaoMin) && r.prazoSolucaoMin >= 60 && r.prazoSolucaoMin <= 90 * 1440)
      || (r.prazoMin && r.prazoSolucaoMin < r.prazoMin))) return 'prazo_solucao';
    if (r.medir && !GC.fonteDaRegra(r)) return 'medir';
    if (!Array.isArray(r.escalonamento) || r.escalonamento.length > 3 || !r.escalonamento.every((e) => Number.isInteger(e.aposMin)
      && e.aposMin >= 5 && e.aposMin <= 30 * 1440 && GC.ACOES_ESCALONAMENTO[e.acao])) return 'escalonamento';
    const sl = r.silencio || {};
    if ((sl.intervaloMin !== null && sl.intervaloMin !== undefined && !(Number.isInteger(sl.intervaloMin) && sl.intervaloMin >= 5 && sl.intervaloMin <= 7 * 1440))
      || (sl.juntarRaioM !== null && sl.juntarRaioM !== undefined && !(Number.isInteger(sl.juntarRaioM) && sl.juntarRaioM >= 10 && sl.juntarRaioM <= 5000))) return 'silencio';
    return null;
  }

  // Campos que o usuário pode mudar (o resto é da regra: id, origem, disparos). Tipo e rascunho só nas
  // criadas: regra padrão não muda de tipo, e o rascunho só sai de rascunho (ativar), nunca volta.
  const EDITAVEIS = ['nome', 'area', 'escopo', 'condicoes', 'combinar', 'fontes', 'gravidade', 'prazoMin', 'prazoSolucaoMin', 'ordem', 'escalonamento', 'silencio', 'medir'];
  const EDITAVEIS_CRIADA = ['tipo', 'rascunho'];
  const copia = (v) => JSON.parse(JSON.stringify(v));
  const vazio = () => ({ sobreposicoes: {}, criadas: [], pausas: {}, seq: 0, atencao: null });

  // Diferença legível entre duas versões (vai para o detalhe da auditoria).
  const nomeBairro = (id) => ((GC.data.bairros.find((b) => b.id === id) || {}).nome || id);
  const tempo = (min) => (GC.tempoTexto ? GC.tempoTexto(min) : `${min} min`);
  const NOME_SEV = { critica: 'crítica', alta: 'alta', media: 'média' };
  GC.mudancasRegra = function (antes, depois) {
    const mud = [];
    if (antes.nome !== depois.nome) mud.push(`Nome: ${antes.nome} → ${depois.nome}`);
    const bairros = (r) => (r.escopo.bairros.length ? r.escopo.bairros.map(nomeBairro).join(', ') : 'cidade inteira');
    if (bairros(antes) !== bairros(depois)) mud.push(`Onde: ${bairros(antes)} → ${bairros(depois)}`);
    if (emPalavras(antes) !== emPalavras(depois)) mud.push(`Quando: ${emPalavras(antes)} → ${emPalavras(depois)}`);
    const grav = (r) => (r.gravidade.base ? NOME_SEV[r.gravidade.base] : 'a da ocorrência') + (r.gravidade.sobe.length ? ` (+${r.gravidade.sobe.length} subida${r.gravidade.sobe.length > 1 ? 's' : ''})` : '');
    if (grav(antes) !== grav(depois)) mud.push(`Gravidade: ${grav(antes)} → ${grav(depois)}`);
    const prazo = (r) => (r.prazoMin ? tempo(r.prazoMin) : 'o da gravidade');
    if (prazo(antes) !== prazo(depois)) mud.push(`Prazo: ${prazo(antes)} → ${prazo(depois)}`);
    const solucao = (r) => (r.prazoSolucaoMin ? tempo(r.prazoSolucaoMin) : 'o da gravidade');
    if (solucao(antes) !== solucao(depois)) mud.push(`Prazo para resolver: ${solucao(antes)} → ${solucao(depois)}`);
    const esc = (r) => (r.escalonamento || []).map(GC.escalonamentoEmPalavras).join('; ') || 'nunca';
    if (esc(antes) !== esc(depois)) mud.push(`Escalar: ${esc(antes)} → ${esc(depois)}`);
    const medir = (r) => (r.medir ? 'sozinha, pelos dados' : 'pela integração da secretaria');
    if (medir(antes) !== medir(depois)) mud.push(`Dispara: ${medir(antes)} → ${medir(depois)}`);
    const sil = (r) => GC.silencioEmPalavras(r.silencio) || 'sem silêncio';
    if (sil(antes) !== sil(depois)) mud.push(`Silêncio: ${sil(antes)} → ${sil(depois)}`);
    if (antes.area !== depois.area) mud.push('Secretaria mudou');
    return mud;
  };

  // "Testar nos últimos 30 dias": quantas vezes a regra teria disparado. É estimativa: parte dos disparos da
  // regra padrão do tipo, divide pelos bairros na proporção dos casos da secretaria em 30 dias
  // (GC.data.historico30d) e ajusta cada limite pelo quanto ele mudou em relação ao padrão.
  // Devolve { total, porBairro: [{ bairroId, nome, n }], base, notas } ou null (sem tipo).
  GC.estimarRegra = function (regra) {
    const padrao = regra && regra.tipo && GC.data.regras[regra.tipo];
    if (!padrao) return null;
    const area = (GC.areaDoTipo && GC.areaDoTipo(regra.tipo)) || regra.area;
    const hist = (GC.data.historico30d || {})[area] || {};
    const somaHist = GC.data.bairros.reduce((s, b) => s + (hist[b.id] || 0), 0);
    const notas = [];
    // Limite mais alto (para ">") dispara menos; mais baixo dispara mais. O expoente suaviza: é tendência, não conta.
    const fatorDe = (c) => {
      if (c.operador === 'sim') return 1;
      const ref = (padrao.condicoes || []).find((x) => x.metrica === c.metrica && x.operador !== 'sim');
      const mt = metrica(c.metrica);
      if (!ref || !Number(ref.valor) || !Number(c.valor)) {
        notas.push(`Sem histórico para “${mt ? mt.nome : c.metrica}”: a estimativa não considera essa condição.`);
        return 1;
      }
      const maior = c.operador === '>' || c.operador === '>=';
      const razao = maior ? ref.valor / c.valor : c.valor / ref.valor;
      return Math.min(5, Math.max(0.05, Math.pow(razao, 1.5)));
    };
    const fatores = (regra.condicoes || []).map(fatorDe);
    const fator = !fatores.length ? 1 : regra.combinar === 'OU' ? Math.max(...fatores) : fatores.reduce((p, f) => p * f, 1);
    const bairros = regra.escopo && regra.escopo.bairros && regra.escopo.bairros.length
      ? GC.data.bairros.filter((b) => regra.escopo.bairros.includes(b.id)) : GC.data.bairros;
    const peso = (b) => (somaHist ? (hist[b.id] || 0) / somaHist : 1 / GC.data.bairros.length);
    const porBairro = bairros.map((b) => ({ bairroId: b.id, nome: b.nome, n: Math.round(padrao.disparos30d * peso(b) * fator) }))
      .filter((x) => x.n > 0).sort((a, b) => b.n - a.n);
    const bruto = bairros.reduce((s, b) => s + padrao.disparos30d * peso(b) * fator, 0);
    if (somaHist && bairros.length < GC.data.bairros.length && !bairros.some((b) => hist[b.id])) {
      notas.push('A secretaria não teve casos nesses bairros nos últimos 30 dias.');
    }
    return { total: Math.round(bruto), bruto, porBairro, base: padrao.disparos30d, notas };
  };

  // Condições a partir da expressão de um rascunho da Maia, quando ela usa métricas do catálogo
  // ("chuva_mm_h > 30 E chamados_156 >= 5"). O que não reconhece fica de fora (o editor mostra a original).
  GC.condicoesDaExpressao = function (expr) {
    const texto = String(expr || '');
    const combinar = /\sOU\s/.test(texto) ? 'OU' : 'E';
    const condicoes = texto.split(/\s+(?:E|OU)\s+/).map((p) => {
      const m = /^\s*([a-z0-9_]+)\s*(>=|<=|>|<|=)\s*(-?[\d.,]+)\s*$/i.exec(p);
      if (m && metrica(m[1]) && metrica(m[1]).tipo === 'numero') return { metrica: m[1], operador: m[2], valor: Number(m[3].replace(',', '.')) };
      const s = /^\s*([a-z0-9_]+)\s*$/i.exec(p);
      if (s && metrica(s[1]) && metrica(s[1]).tipo === 'sim') return { metrica: s[1], operador: 'sim' };
      return null;
    }).filter(Boolean);
    return { condicoes, combinar };
  };

  GC.criarRegrasAlerta = function ({ armazenamento, chave = 'gc.regras', agora = () => (GC.agora ? GC.agora() : Date.now()) } = {}) {
    const memoria = {};
    const A = armazenamento || {
      ler: (k) => memoria[k],
      gravar: (k, v) => { memoria[k] = copia(v); },
    };
    const ler = () => {
      const v = A.ler(chave);
      return v && typeof v === 'object' ? Object.assign(vazio(), copia(v)) : vazio();
    };
    let estado = ler();
    const ouvintes = new Set();
    const disparosSessao = {}; // id → disparos desde que a aba abriu (não entram em GC.alertas30d)
    const emitir = (tipo, id) => ouvintes.forEach((fn) => fn({ tipo, id }));
    const gravar = () => A.gravar(chave, estado);

    // Regra padrão como o sistema a entrega (antes de qualquer sobreposição).
    function padrao(tipo) {
      const r = GC.data.regras[tipo];
      return {
        id: tipo, versao: 1, origem: 'padrao', rascunho: false,
        nome: maiuscula(tipo), tipo, area: GC.areaDoTipo ? GC.areaDoTipo(tipo) : null, ordem: r.ordem || 999,
        escopo: { bairros: [] }, condicoes: copia(r.condicoes || []), combinar: r.combinar || 'E',
        fontes: r.fontes.slice(), gravidade: { base: null, sobe: [] }, prazoMin: null, prazoSolucaoMin: null,
        escalonamento: [], silencio: SILENCIO_VAZIO(), medir: false,
        disparos30d: r.disparos30d, texto: r.texto || null, expressaoOriginal: r.expressao,
        editadaEm: null, editadaPor: null,
      };
    }

    function completar(r) {
      // Regras gravadas antes da fase 3 não têm escalonamento nem silêncio.
      if (!Array.isArray(r.escalonamento)) r.escalonamento = [];
      r.medir = !!r.medir;
      r.silencio = Object.assign(SILENCIO_VAZIO(), r.silencio || {});
      const pausa = estado.pausas[r.id] || null;
      const ativa = !pausa || (pausa.ate !== null && pausa.ate <= agora());
      const out = Object.assign(r, {
        pausa: ativa ? null : pausa,
        ativa: ativa && !r.rascunho,
        disparosSessao: disparosSessao[r.id] || 0,
      });
      out.expressao = r.texto && r.expressaoOriginal ? r.expressaoOriginal : expressao(r);
      out.palavras = emPalavras(r);
      return out;
    }

    function efetiva(id) {
      if (GC.data.regras[id]) {
        const base = padrao(id);
        const sob = estado.sobreposicoes[id];
        if (!sob) return completar(base);
        const r = Object.assign(base, copia(sob), { modificada: true });
        // Mudou a condição: o texto escrito à mão e a expressão original deixam de valer (o texto sai da estrutura).
        if (sob.condicoes || sob.combinar) { r.texto = null; r.expressaoOriginal = null; }
        return completar(r);
      }
      const c = estado.criadas.find((x) => x.id === id);
      return c ? completar(copia(c)) : null;
    }

    const efetivas = () => [...Object.keys(GC.data.regras).map(efetiva), ...estado.criadas.map((c) => efetiva(c.id))]
      .sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome, 'pt-BR'));

    // A regra que vale para a ocorrência (mesmo pausada: aí ela fica retida). null = nenhuma regra do tipo.
    function paraOcorrencia(o) {
      const candidatas = efetivas().filter((r) => !r.rascunho && r.tipo === o.tipo
        && (!r.escopo.bairros.length || r.escopo.bairros.includes(o.bairroId)));
      candidatas.sort((a, b) => (b.escopo.bairros.length > 0) - (a.escopo.bairros.length > 0) || a.ordem - b.ordem);
      return candidatas[0] || null;
    }

    // Gravidade e prazo que a regra dá à ocorrência (sem mudar a ocorrência).
    function aplicar(regra, o) {
      let sev = (regra && regra.gravidade.base) || o.severidade;
      ((regra && regra.gravidade.sobe) || []).forEach((s) => {
        const v = Number(o[s.metrica]);
        const passa = { '>': v > s.valor, '>=': v >= s.valor, '<': v < s.valor, '<=': v <= s.valor, '=': v === s.valor }[s.operador];
        if (Number.isFinite(v) && passa && PESO_SEV[s.para] < PESO_SEV[sev]) sev = s.para;
      });
      return { severidade: sev, prazoMin: (regra && regra.prazoMin) || null, prazoSolucaoMin: (regra && regra.prazoSolucaoMin) || null };
    }

    // Retrato da regra na hora do disparo (o detalhe da ocorrência mostra a regra como estava).
    // Regra medida: a fonte é a dos dados lidos (leitos, áreas de risco…), não a integração da secretaria.
    const retrato = (r) => ({ id: r.id, versao: r.versao, nome: r.nome, expressao: r.expressao,
      fontes: r.medir && GC.fonteDaRegra(r) ? [maiuscula(GC.FONTES_MEDIDAS[GC.fonteDaRegra(r)].nome)] : r.fontes.slice(), disparos30d: r.disparos30d, texto: r.palavras,
      escalonamento: copia(r.escalonamento || []), silencio: copia(r.silencio || SILENCIO_VAZIO()) });

    function salvar(id, mudancas, quem = null) {
      estado = ler();
      const antes = efetiva(id);
      if (!antes) return { ok: false, motivo: 'nao_encontrada' };
      const campos = {};
      EDITAVEIS.concat(antes.origem === 'padrao' ? [] : EDITAVEIS_CRIADA)
        .forEach((k) => { if (mudancas[k] !== undefined) campos[k] = copia(mudancas[k]); });
      if (campos.rascunho === true && !antes.rascunho) return { ok: false, motivo: 'rascunho' };
      // O formulário manda tudo: só conta o que mudou de fato (condição igual não apaga o texto escrito à mão).
      Object.keys(campos).forEach((k) => { if (JSON.stringify(campos[k]) === JSON.stringify(antes[k])) delete campos[k]; });
      if (!Object.keys(campos).length) return { ok: true, regra: antes, antes, mudancas: [], semMudanca: true };
      // A secretaria da regra é a do tipo (o setor não passa regra para outra pasta trocando o tipo).
      if (campos.tipo && GC.areaDoTipo && GC.areaDoTipo(campos.tipo)) campos.area = GC.areaDoTipo(campos.tipo);
      const depois = Object.assign(copia(antes), campos);
      if (depois.condicoes !== antes.condicoes && campos.condicoes) depois.texto = null;
      const erro = validar(depois);
      if (erro) return { ok: false, motivo: erro };
      const meta = { versao: antes.versao + 1, editadaEm: agora(), editadaPor: quem };
      if (antes.origem === 'padrao') {
        estado.sobreposicoes[id] = Object.assign(estado.sobreposicoes[id] || {}, campos, meta);
      } else {
        const c = estado.criadas.find((x) => x.id === id);
        Object.assign(c, campos, meta);
      }
      gravar();
      emitir('editada', id);
      const r = efetiva(id);
      return { ok: true, regra: r, antes, mudancas: GC.mudancasRegra(antes, r) };
    }

    // dados: { nome, tipo, area, escopo, condicoes, combinar, fontes, gravidade, prazoMin, prazoSolucaoMin } (origem 'personalizada')
    // ou { origem: 'maia', nome, expressao, fontes, area }: rascunho que não dispara até ser revisado.
    function criar(dados, quem = null) {
      estado = ler();
      // Maia com modelo: vira regra ativa e medida (a expressão original fica guardada para o detalhe).
      const modelo = dados.origem === 'maia' && GC.MODELOS_ALERTA_MAIA[String(dados.expressao || '').trim()];
      if (modelo && GC.data.regras[modelo.tipo]) {
        estado = ler();
        const igual = estado.criadas.find((x) => x.origem === 'maia' && x.nome === dados.nome);
        if (igual) return { ok: true, criada: false, regra: efetiva(igual.id) };
        dados = Object.assign({}, dados, { tipo: modelo.tipo, condicoes: modelo.condicoes, combinar: modelo.combinar || 'E', medir: true, ativaPelaMaia: true });
      }
      const maia = dados.origem === 'maia' && !dados.ativaPelaMaia;
      if (dados.origem === 'maia' && !dados.ativaPelaMaia) {
        const igual = estado.criadas.find((x) => x.origem === 'maia' && x.nome === dados.nome);
        if (igual) return { ok: true, criada: false, regra: efetiva(igual.id) };
      }
      const n = estado.seq + 1;
      const r = {
        id: `${dados.origem === 'maia' ? 'maia' : 'rg'}-${n}`, versao: 1, origem: dados.origem === 'maia' ? 'maia' : 'personalizada', rascunho: maia,
        nome: String(dados.nome || '').trim(), tipo: maia ? null : dados.tipo,
        area: (!maia && dados.tipo && GC.areaDoTipo ? GC.areaDoTipo(dados.tipo) : null) || dados.area || null,
        ordem: Number.isFinite(dados.ordem) ? dados.ordem : 1000 + n,
        escopo: { bairros: ((dados.escopo || {}).bairros || []).slice() }, condicoes: copia(dados.condicoes || []),
        combinar: dados.combinar || 'E',
        // Sem fontes informadas, ficam as da regra do sistema do mesmo tipo (o detalhe mostra de onde vem o dado).
        fontes: ((dados.fontes && dados.fontes.length ? dados.fontes : !maia && GC.data.regras[dados.tipo] ? GC.data.regras[dados.tipo].fontes : []) || []).slice(),
        gravidade: copia(dados.gravidade || { base: null, sobe: [] }), prazoMin: dados.prazoMin || null, prazoSolucaoMin: dados.prazoSolucaoMin || null,
        escalonamento: copia(dados.escalonamento || []), silencio: Object.assign(SILENCIO_VAZIO(), copia(dados.silencio || {})), medir: !maia && !!dados.medir,
        disparos30d: 0, texto: null, expressaoOriginal: dados.origem === 'maia' ? String(dados.expressao || '') : null,
        criadaEm: agora(), editadaEm: null, editadaPor: quem,
      };
      if (!maia && !(r.tipo && GC.data.regras[r.tipo])) return { ok: false, motivo: 'tipo' };
      const erro = validar(r);
      if (erro) return { ok: false, motivo: erro };
      estado.seq = n;
      estado.criadas.push(r);
      gravar();
      emitir('criada', r.id);
      return { ok: true, criada: true, regra: efetiva(r.id) };
    }

    function excluir(id) {
      estado = ler();
      const i = estado.criadas.findIndex((x) => x.id === id);
      if (i < 0) return { ok: false, motivo: GC.data.regras[id] ? 'padrao' : 'nao_encontrada' };
      const [r] = estado.criadas.splice(i, 1);
      delete estado.pausas[id];
      gravar();
      emitir('excluida', id);
      return { ok: true, regra: r };
    }

    // Limites de "Precisam de você" (um conjunto para a cidade).
    // Regras ativas que disparam sozinhas e os alvos que passam agora. Pausada não mede: ao voltar, mede de novo.
    const avaliarMedidas = () => efetivas().filter((r) => r.medir && r.ativa && !r.rascunho)
      .flatMap((regra) => GC.alvosQuePassam(regra).map((alvo) => ({ regra, alvo, fonte: GC.fonteDaRegra(regra) })));

    const atencao = () => Object.assign(copia(GC.ATENCAO_PADRAO), estado.atencao ? copia(estado.atencao) : {});
    function salvarAtencao(mudancas, quem = null) {
      estado = ler();
      const antes = atencao();
      const depois = Object.assign(copia(antes), copia(mudancas || {}));
      if (!atencaoValida(depois)) return { ok: false, motivo: 'atencao' };
      estado.atencao = Object.assign({}, depois, { editadaEm: agora(), editadaPor: quem });
      gravar();
      emitir('atencao', null);
      return { ok: true, antes, atencao: atencao() };
    }
    function restaurarAtencao() {
      estado = ler();
      const antes = atencao();
      estado.atencao = null;
      gravar();
      emitir('atencao', null);
      return { ok: true, antes, atencao: atencao() };
    }

    function restaurar(id) {
      estado = ler();
      if (!estado.sobreposicoes[id]) return { ok: false, motivo: 'sem_mudanca' };
      const antes = efetiva(id);
      delete estado.sobreposicoes[id];
      gravar();
      emitir('restaurada', id);
      return { ok: true, antes, regra: efetiva(id) };
    }

    // minutos: null = até reativar.
    function pausar(id, minutos = null, quem = null) {
      estado = ler();
      const r = efetiva(id);
      if (!r || r.rascunho) return { ok: false, motivo: 'nao_encontrada' };
      const t = agora();
      estado.pausas[id] = { desde: t, ate: minutos ? t + minutos * 60000 : null, quem };
      gravar();
      emitir('pausada', id);
      return { ok: true, regra: efetiva(id) };
    }

    function retomar(id) {
      estado = ler();
      if (!estado.pausas[id]) return { ok: false, motivo: 'nao_pausada' };
      delete estado.pausas[id];
      gravar();
      emitir('retomada', id);
      return { ok: true, regra: efetiva(id) };
    }

    return {
      efetivas,
      buscar: efetiva,
      paraOcorrencia,
      aplicar,
      retrato,
      salvar,
      criar,
      excluir,
      restaurar,
      pausar,
      retomar,
      atencao,
      avaliarMedidas,
      salvarAtencao,
      restaurarAtencao,
      contarDisparo(id) { disparosSessao[id] = (disparosSessao[id] || 0) + 1; },
      // Outra aba gravou (evento storage): relê e avisa quem desenha.
      recarregar() { estado = ler(); emitir('recarga', null); },
      assinar(fn) { ouvintes.add(fn); return () => ouvintes.delete(fn); },
    };
  };

  GC.regraEmPalavrasEstruturada = emPalavras;
  GC.expressaoRegra = expressao;
  GC.OPERADORES_ALERTA = OP_PALAVRA;

  // Instância do navegador, por cidade. Sem localStorage (testes), cada store cria a sua.
  if (typeof window !== 'undefined' && window.localStorage) {
    const chave = `gc.regras.${GC.cidade ? GC.cidade.id : 'media'}`;
    GC.CHAVE_REGRAS = chave;
    GC.regrasAlerta = GC.criarRegrasAlerta({
      chave,
      armazenamento: {
        ler(k) { try { return JSON.parse(window.localStorage.getItem(k)); } catch (e) { return null; } },
        gravar(k, v) { try { window.localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* sem armazenamento */ } },
      },
    });
  }
})(window.GC = window.GC || {});
