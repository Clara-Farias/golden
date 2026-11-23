(function (GC) {
  // Plural pelo número (tom-de-voz.md): "1 rota atrasada", "3 rotas atrasadas", nunca "rota(s)".
  const plural = (n, um, varios) => `${n} ${Number(n) === 1 ? um : varios}`;
  // IA roteirizada. Ponto de integração: troque este arquivo pela IA real mantendo
  // GC.ia.perguntar(texto, contexto) e GC.ia.aoEvento(evento, contexto) → Resposta (ver spec).
  // Este arquivo é o motor; os temas (palavras-chave, resposta, origem, base, selo e alerta) ficam um por
  // arquivo em js/ia/tema-*.js e se registram em GC.temasIA. Tema novo = arquivo novo + <script>.
  GC.temasIA = GC.temasIA || [];
  // Ordem dos temas: empate de palavras-chave vence o de menor "ordem" (por isso "risco" antes de
  // "alagamento": "onde vai alagar?" é previsão; "onde mais alaga?" continua sendo histórico).
  const temas = () => GC.temasIA.slice().sort((a, b) => a.ordem - b.ordem);
  const tema = (id) => GC.temasIA.find((t) => t.id === id);

  const SEVERIDADE = { critica: 'crítica', alta: 'alta', media: 'média' };
  const PESO_SEVERIDADE = { critica: 0, alta: 1, media: 2 };

  // ---- utilidades ----
  const normalizar = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  const bairro = (id) => GC.data.bairros.find((b) => b.id === id);
  const area = (id) => GC.data.areas.find((a) => a.id === id);

  function ranking(contagem) {
    return Object.entries(contagem).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
  }

  function barraPorBairro(contagem, titulo, nomeSerie, unidade) {
    const r = ranking(contagem);
    return { tipo: 'barra', titulo, rotulos: r.map(([id]) => bairro(id).nome), series: [{ nome: nomeSerie, valores: r.map(([, n]) => n) }], unidade };
  }

  // Pontos de calor: histórico espalhado em volta do centro de cada bairro + ocorrências ativas da área.
  function calor(areaId, contexto, legenda) {
    const pontos = [];
    ranking(GC.data.historico30d[areaId]).forEach(([id, n]) => {
      const [lat, lng] = bairro(id).centro;
      for (let i = 0; i < n; i++) {
        const ang = (i / n) * Math.PI * 2 + n;
        const raio = 0.0015 + (i % 3) * 0.0015;
        pontos.push({ lat: +(lat + Math.sin(ang) * raio).toFixed(5), lng: +(lng + Math.cos(ang) * raio).toFixed(5), peso: 0.6 });
      }
    });
    (contexto.ocorrencias || []).filter((o) => o.area === areaId).forEach((o) => pontos.push({ lat: o.lat, lng: o.lng, peso: 1 }));
    const topo = ranking(GC.data.historico30d[areaId])[0];
    const [lat, lng] = bairro(topo[0]).centro;
    return { tipo: 'calor', pontos, foco: { lat, lng, zoom: 14 }, legenda };
  }

  // Ocorrência ativa mais grave que passa no filtro (ou undefined).
  function maisGrave(contexto, filtro) {
    return (contexto.ocorrencias || []).filter(filtro).sort((a, b) => PESO_SEVERIDADE[a.severidade] - PESO_SEVERIDADE[b.severidade])[0];
  }

  function focarPrimeira(contexto, filtro) {
    const o = maisGrave(contexto, filtro);
    return o ? [{ rotulo: `Ver no mapa: ${o.titulo}`, tipo: 'focarOcorrencia', payload: { ocorrenciaId: o.id } }] : [];
  }

  const agora = (o) => (o ? ` Agora, o ponto mais urgente é: ${o.titulo} (${bairro(o.bairroId).nome}).` : '');

  // Indicadores do workshop de 04/11 (leitos, B.O.s, risco, obras, escolas): a ação liga a camada no mapa.
  const camada = (rotulo, nome, id) => ({ rotulo, tipo: 'abrirCamada', payload: id ? { camada: nome, id } : { camada: nome } });
  const unicos = (lista) => [...new Set(lista)];
  const sinal = (n) => `${n > 0 ? '+' : ''}${n}%`;
  const pct = (n) => `${Number(n).toLocaleString('pt-BR')}%`;
  const nomes = (lista) => (lista.length > 1 ? `${lista.slice(0, -1).join(', ')} e ${lista[lista.length - 1]}` : lista[0] || '');
  const minuscula = (t) => t.charAt(0).toLowerCase() + t.slice(1);

  // Base consultada: quantos registros a consulta leu e o período que cobre. Contado dos mesmos dados que
  // montam a resposta (não é um número decorativo). Tema sem módulo carregado fica sem contagem.
  const soma = (o) => Object.values(o || {}).reduce((s, n) => s + n, 0);
  const casos30d = (areaId) => soma(GC.data.historico30d[areaId]);

  // Ajudantes que os temas usam (js/ia/tema-*.js).
  GC.iaUtil = { plural, SEVERIDADE, PESO_SEVERIDADE, normalizar, bairro, area, ranking, barraPorBairro, calor, maisGrave, focarPrimeira, agora, camada, unicos, sinal, pct, nomes, minuscula, soma, casos30d };
  const referencia = () => new Date(GC.agora ? GC.agora() : Date.now()).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  function baseConsultada(id, contexto) {
    const b = (tema(id) || {}).base;
    if (!b) return null;
    let registros;
    try { registros = Math.max(0, Math.round(b.registros(contexto || {}))); } catch (e) { return null; }
    return Number.isFinite(registros) ? { registros, periodo: b.periodo, referencia: referencia() } : null;
  }
  GC.baseConsultada = baseConsultada;

  function confiabilidade(fontes, areas) {
    const min = Math.min(...areas.map((a) => GC.data.basesSecretarias[a].atualizadoHaMin));
    return { nivel: fontes.length >= 2 ? 'alta' : 'media', motivo: `${fontes.length} ${fontes.length === 1 ? 'fonte' : 'fontes'} · atualizadas há ${min} min`, atualizadoHaMin: min };
  }

  // Selo de confiança: previsão (de terceiros, como o tempo) e análise da Maia (conclusão cruzando bases)
  // ganham selo (campo "selo" do tema); o que foi medido é o padrão e fica só com o rodapé de fonte.
  // Temas de uma secretaria viram regra de monitoramento pelo "🔔 Transformar em alerta" (campo "alerta").
  function comOrigem(id, resposta, pergunta, contexto) {
    const t = tema(id) || {};
    const o = t.origem;
    if (!o) return resposta;
    Object.assign(resposta, { fontes: o.fontes, confiabilidade: confiabilidade(o.fontes, o.areas), consulta: o.consulta });
    if (t.selo && !resposta.selo) resposta.selo = t.selo;
    const base = baseConsultada(id, contexto);
    if (base) resposta.base = base;
    if (t.alerta && o.areas.length === 1 && pergunta) {
      const acao = { rotulo: '🔔 Transformar em alerta', tipo: 'criarAlerta', payload: { nome: `Pergunta: ${pergunta.trim()}`.slice(0, 120), expressao: t.alerta, fontes: o.fontes, area: o.areas[0] } };
      resposta.acoes = [...(resposta.acoes || []), acao];
    }
    return resposta;
  }

  // Ações do prefeito sobre uma ocorrência (cobrar, priorizar, gabinete de crise).
  function agir(o, acao) {
    const rotulo = { cobrar: `📣 Cobrar ${area(o.area).secretaria.nome}`, priorizar: '⚡ Priorizar', gabinete: '🚨 Gabinete de crise' }[acao];
    return { rotulo, tipo: 'agir', payload: { ocorrenciaId: o.id, acao } };
  }

  // Pergunta feita a partir da gaveta de um alerta: resposta montada com os dados do próprio alerta.
  function sobreOcorrencia(o) {
    const d = GC.detalharOcorrencia(o);
    const fontes = [...d.regra.fontes.map((f) => `${o.area}.${normalizar(f).replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')}`), 'planejamento.bairros'];
    const acoes = [...GC.acoesDisponiveis(o).map((tipo) => agir(o, tipo)), { rotulo: 'Ver no mapa', tipo: 'focarOcorrencia', payload: { ocorrenciaId: o.id } }];
    return {
      cenario: 'ocorrencia',
      texto: `"${o.titulo}" (${bairro(o.bairroId).nome}) disparou pela regra ${d.regra.expressao}. ${d.evidencias.join('. ')}. ${o.status === 'resolvida' ? 'Este alerta já foi resolvido; se voltar a acontecer, a sugestão continua: ' : 'Sugiro: '}${d.acaoRecomendada.charAt(0).toLowerCase()}${d.acaoRecomendada.slice(1)}.`,
      fontes,
      confiabilidade: confiabilidade(fontes, [o.area]),
      consulta: `SELECT * FROM ${fontes[0]} WHERE bairro = '${o.bairroId}' AND data >= hoje() - 30`,
      base: { registros: ((GC.data.historico30d[o.area] || {})[o.bairroId] || 0) + 1, periodo: 'últimos 30 dias no bairro', referencia: referencia() },
      acoes,
    };
  }

  // Sugestões: as dos indicadores do workshop primeiro (só se o módulo estiver carregado).
  const sugestoes = [
    ...(GC.leitos ? ['Como estão os leitos de UTI?'] : []),
    ...(GC.risco ? ['Onde vai alagar nas próximas horas?'] : []),
    ...(GC.obras ? ['Quais obras estão atrasadas?'] : []),
    ...(GC.educacao ? ['Onde faltam professores?'] : []),
    ...(GC.frota ? ['Quantos ônibus e ambulâncias estão rodando?'] : []),
    ...(GC.coleta ? ['Quando passa o caminhão de lixo no Centro?'] : []),
    ...(GC.medicamentos ? ['Vai faltar algum medicamento?'] : []),
    'Onde mais alaga este mês?',
    'Como evoluiu a criminalidade?',
    'Como está a lotação das UBS?',
    'Quem está atrasando os prazos?',
    ...(GC.leitos ? [] : ['Quais bairros têm mais falta de energia?', 'Onde está o trânsito mais crítico?']),
  ];

  // Cumprimento sem tema ("bom dia", "oi, tudo bem?"): responde com o quadro do momento.
  const CUMPRIMENTO = /^(oi|ola|ei|opa|bom dia|boa tarde|boa noite|tudo bem|tudo certo|e ai|salve)\b/;
  const saudacaoDoDia = () => {
    const h = new Date(GC.agora ? GC.agora() : Date.now()).getHours();
    return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
  };

  // ---- escolha do tema: pesos, palavra inteira e exclusões (spec 2026-11-12, Maia v2) ----
  // Chave em texto vale PESO_PADRAO; { termo, peso, inteira } muda o peso. Peso FORTE é o específico ("UTI").
  const PESO_PADRAO = 2;
  const FORTE = 3;
  const escRe = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const chave = (k) => (typeof k === 'string' ? { termo: k, peso: PESO_PADRAO } : Object.assign({ peso: PESO_PADRAO }, k));
  const disponivel = (c) => !c.disponivel || c.disponivel(); // tema de um módulo que não foi carregado fica de fora
  // A chave começa no início de uma palavra ("obra" casa "obras", não "cobrando"). Inteira: a palavra ou o plural.
  const casa = (q, k) => {
    const t = escRe(normalizar(k.termo));
    return new RegExp(k.inteira ? `(^|[^a-z0-9])${t}s?(?=$|[^a-z0-9])` : `(^|[^a-z0-9])${t}`).test(q);
  };

  // Temas que pontuam, do mais forte ao mais fraco (empate: menor ordem). Exclusão ("fila de escola" tira a
  // saúde) só não vale quando o tema casou uma chave específica ("UBS perto da escola" continua saúde).
  function pontuar(texto) {
    const q = normalizar(texto);
    if (!q) return [];
    return temas().filter(disponivel).map((c) => {
      const casadas = c.chaves.map(chave).filter((k) => casa(q, k));
      const forte = casadas.some((k) => k.peso >= FORTE);
      const excluido = !forte && (c.exclui || []).some((x) => casa(q, chave(x)));
      return { id: c.id, tema: c, pontos: excluido ? 0 : casadas.reduce((s, k) => s + k.peso, 0), casadas: casadas.map((k) => k.termo), excluido };
    }).filter((x) => x.pontos > 0).sort((a, b) => b.pontos - a.pontos || a.tema.ordem - b.tema.ordem);
  }

  const sugerir = (lista) => lista.map((s) => ({ rotulo: s, tipo: 'perguntar', payload: { texto: s } }));
  const capitalizar = (t) => t.charAt(0).toUpperCase() + t.slice(1);

  // Empate fraco entre dois temas: a Maia pergunta de volta em vez de chutar.
  // "Fiquei em dúvida sobre “fila”. Você quer saber das UBS ou das escolas e creches?"
  function esclarecer(a, b, texto, ent) {
    // Palavra que os dois temas casaram, como o usuário escreveu ("fila"); sem palavra comum, a dúvida é geral.
    const comum = a.casadas.find((t) => b.casadas.includes(t));
    const palavra = comum && ent.palavras.find((w) => w.startsWith(normalizar(comum)));
    const original = palavra && String(texto).split(/[^\p{L}\d]+/u).find((w) => normalizar(w) === palavra);
    const assunto = (t) => t.assunto || `de ${minuscula(t.nome || t.id)}`;
    return {
      cenario: 'esclarecer',
      texto: `${original ? `Fiquei em dúvida sobre “${original}”.` : 'Fiquei em dúvida entre dois assuntos.'} Você quer saber ${assunto(a.tema)} ou ${assunto(b.tema)}?`,
      acoes: [a, b].map((x) => ({ rotulo: x.tema.nome || capitalizar(x.id), tipo: 'perguntar', payload: { texto: String(texto).trim(), tema: x.id } })),
    };
  }

  // ---- "Você quis dizer…": temas próximos por erro de digitação, prefixo comum ou secretaria citada ----
  function distancia(a, b) {
    const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
    for (let j = 1; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++) {
      for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    return d[a.length][b.length];
  }
  const COMUNS = new Set(['como', 'esta', 'estao', 'qual', 'quais', 'onde', 'quando', 'quanto', 'quantos', 'quantas', 'cidade', 'prefeitura', 'bairro', 'bairros', 'sobre', 'para', 'pela', 'pelo', 'isso', 'essa', 'esse', 'mais', 'menos', 'muito', 'hoje', 'agora', 'semana', 'tudo', 'todos', 'todas', 'algum', 'alguma', 'teve', 'temos', 'tenho', 'fazer', 'mostre', 'mostra', 'quero', 'saber']);
  // Mesma primeira letra (o erro de digitação raramente está nela) e distância de edição pequena até a chave.
  const parecida = (w, t) => {
    if (w[0] !== t[0]) return false;
    const tol = t.length >= 7 ? 2 : 1;
    for (let n = t.length - 1; n <= t.length + 1; n++) if (n >= 3 && distancia(w.slice(0, n), t) <= tol) return true;
    return false;
  };
  function proximos(ent, contexto) {
    const pals = ent.palavras.filter((w) => w.length >= 4 && !COMUNS.has(w));
    const dele = (c) => !contexto.areasPerfil || !c.origem || c.origem.areas.some((a) => contexto.areasPerfil.includes(a));
    return temas().filter((c) => disponivel(c) && c.exemplo && dele(c)).map((c) => {
      let p = 0;
      c.chaves.map(chave).forEach((k) => {
        const t = normalizar(k.termo).split(' ')[0];
        if (t.length >= 4 && pals.some((w) => parecida(w, t))) p += k.peso;
      });
      // Secretaria citada puxa os temas dela (não os que cruzam todas as pastas, como a satisfação).
      if (c.origem && c.origem.areas.length <= 2 && ent.secretarias.some((a) => c.origem.areas.includes(a))) p += 1;
      return { c, p };
    }).filter((x) => x.p > 0).sort((a, b) => b.p - a.p || a.c.ordem - b.c.ordem).slice(0, 3).map((x) => x.c);
  }

  // ---- mês anterior (fase 3): GC.data.historicoMesAnterior, mesmo formato do historico30d ----
  const anteriorDe = (areaId) => (GC.data.historicoMesAnterior || {})[areaId] || null;
  const somaEm = (mapa, ids) => (ids && ids.length ? ids.reduce((s, id) => s + (mapa[id] || 0), 0) : soma(mapa));
  // "+22%", "-15%", "estável" ou "antes não havia casos".
  function variacao(antes, agora) {
    if (antes === agora) return 'estável';
    if (!antes) return 'antes não havia casos';
    return sinal(Math.round(((agora - antes) / antes) * 100));
  }
  // Barras por bairro: mês anterior e últimos 30 dias (só os 30 dias quando a área não tem o mês anterior).
  function graficoAntesDepois(areaId, ids, titulo) {
    const hist = GC.data.historico30d[areaId];
    const ant = anteriorDe(areaId);
    return {
      tipo: 'barra', titulo, rotulos: ids.map((id) => bairro(id).nome), unidade: 'casos',
      series: [...(ant ? [{ nome: 'Mês anterior', valores: ids.map((id) => ant[id] || 0) }] : []), { nome: 'Últimos 30 dias', valores: ids.map((id) => hist[id] || 0) }],
    };
  }
  // Bairros que mais mudaram entre os dois meses (sentido: +1 alta, -1 queda).
  function quemMudou(areaId, ids, sentido) {
    const hist = GC.data.historico30d[areaId];
    const ant = anteriorDe(areaId);
    return (ids && ids.length ? ids : Object.keys(hist)).map((id) => ({ id, antes: ant[id] || 0, agora: hist[id] || 0 }))
      .map((x) => Object.assign(x, { delta: x.agora - x.antes })).filter((x) => x.delta * sentido > 0)
      .sort((a, b) => (b.delta - a.delta) * sentido);
  }
  const deAte = (x) => `${bairro(x.id).nome} (${x.antes} → ${x.agora})`;

  // "e no mês passado?" num tema que conta casos por bairro: o mês anterior lado a lado com os últimos 30 dias.
  function mesPassado(t, r, ent) {
    const areaId = t.historico;
    const ant = anteriorDe(areaId);
    const hist = GC.data.historico30d[areaId];
    if (!ant || !hist) return null;
    const nomeArea = area(areaId).nome;
    const ids = ent.bairros.slice(0, 3);
    const linha = (escopo, a, b) => `${escopo}, foram ${plural(a, 'caso', 'casos')} de ${nomeArea} no mês anterior e ${b} nos últimos 30 dias (${variacao(a, b)})`;
    let texto;
    if (ids.length) {
      texto = `${ids.map((id, i) => linha(`${i ? 'no' : 'No'} bairro ${bairro(id).nome}`, ant[id] || 0, hist[id] || 0)).join('; ')}.`;
    } else {
      const sobe = quemMudou(areaId, null, 1);
      const desce = quemMudou(areaId, null, -1);
      texto = `${linha('Na cidade', soma(ant), soma(hist))}.${sobe.length ? ` A maior alta foi em ${nomes(sobe.slice(0, 2).map(deAte))}.` : ''}${desce.length ? ` Caiu em ${nomes(desce.slice(0, 2).map(deAte))}.` : ''}`;
    }
    const mostrar = ids.length ? ids : Object.keys(hist).filter((id) => (hist[id] || 0) + (ant[id] || 0) > 0).sort((a, b) => (hist[b] + ant[b]) - (hist[a] + ant[a])).slice(0, 8);
    const mudou = (ids.length ? ids : quemMudou(areaId, null, 1).map((x) => x.id)).slice(0, 3);
    return Object.assign({}, r, {
      texto,
      grafico: graficoAntesDepois(areaId, mostrar, `${nomeArea}: mês anterior e últimos 30 dias`),
      ...(mudou.length ? { mapa: { tipo: 'destaque', bairros: mudou, legenda: ids.length ? `${nomeArea}: ${nomes(ids.map((id) => bairro(id).nome))}` : `${nomeArea}: bairros que subiram` } } : {}),
    });
  }

  // "por que piorou?": compara os dois meses na área, aponta os bairros que puxaram a mudança e cruza com o prazo
  // da secretaria, o indicador da semana e o alerta mais grave. É análise da Maia (selo), não número medido.
  const PEDIU_PIORA = /\b(piorou|piora|aument\w*|subi\w*|cresc\w*)\b/;
  function explicar(areaId, ent, ctx, t) {
    const ant = anteriorDe(areaId);
    const hist = GC.data.historico30d[areaId];
    if (!ant || !hist) return null;
    const a = area(areaId);
    const ids = ent.bairros.slice(0, 3);
    const antes = somaEm(ant, ids);
    const agora = somaEm(hist, ids);
    const onde = ids.length ? ` em ${nomes(ids.map((id) => bairro(id).nome))}` : '';
    const sentido = agora > antes ? 1 : agora < antes ? -1 : 0;
    const verbo = sentido > 0 ? 'subiram' : sentido < 0 ? 'caíram' : 'ficaram estáveis';
    const naoPiorou = PEDIU_PIORA.test(ent.q) && sentido <= 0;
    let texto = `${naoPiorou ? 'Pelos registros, não piorou: os' : 'Os'} casos de ${a.nome}${onde} ${verbo}${sentido ? ` de ${antes} para ${agora}` : ` (${agora})`} em 30 dias${sentido ? ` (${variacao(antes, agora)})` : ''}.`;
    const puxaram = sentido ? quemMudou(areaId, ids.length > 1 ? ids : null, sentido).slice(0, 2) : [];
    if (puxaram.length && ids.length !== 1) texto += ` A ${sentido > 0 ? 'alta' : 'queda'} veio sobretudo de ${nomes(puxaram.map(deAte))}.`;
    const d = (GC.data.desempenho30d || {})[areaId];
    if (d && d.anterior) {
      const prazo = d.noPrazoPct - d.anterior.noPrazoPct;
      const tempo = Math.round((d.tempoMedioH - d.anterior.tempoMedioH) * 10) / 10;
      const num1 = (n) => Number(n).toLocaleString('pt-BR');
      if (prazo || tempo) texto += ` No mesmo período, a ${a.secretaria.nome} resolveu ${d.noPrazoPct}% no prazo (antes ${d.anterior.noPrazoPct}%) e levou em média ${num1(d.tempoMedioH)} h (antes ${num1(d.anterior.tempoMedioH)} h).`;
    }
    const tend = (GC.data.tendencias || []).find((x) => x.area === areaId && !x.positivo);
    if (tend) texto += ` O indicador "${tend.rotulo}" está em ${tend.valor}.`;
    const foco = ids.length ? ids : puxaram.map((x) => x.id);
    const grave = maisGrave(ctx, (o) => o.area === areaId && (!foco.length || foco.includes(o.bairroId))) || maisGrave(ctx, (o) => o.area === areaId);
    if (grave) texto += ` Agora, o ponto mais urgente é ${grave.titulo} (${bairro(grave.bairroId).nome}).`;
    const piorouPrazo = d && d.anterior && d.noPrazoPct < d.anterior.noPrazoPct;
    if (sentido > 0) texto += piorouPrazo ? ` Sugiro cobrar da ${a.secretaria.nome} um plano para ${foco.length ? nomes(foco.map((id) => bairro(id).nome)) : 'a área'}.` : ` Sugiro acompanhar ${foco.length ? nomes(foco.map((id) => bairro(id).nome)) : 'a área'} nas próximas semanas.`;
    const mostrar = ids.length ? ids : Object.keys(hist).filter((id) => (hist[id] || 0) + (ant[id] || 0) > 0).sort((x, y) => Math.abs((hist[y] || 0) - (ant[y] || 0)) - Math.abs((hist[x] || 0) - (ant[x] || 0))).slice(0, 6);
    const fontes = ['gestao.ocorrencias', 'gestao.prazos_sla', 'gabinete.indicadores', 'planejamento.bairros'];
    const acoes = grave ? [...(sentido > 0 && GC.acoesDisponiveis && GC.acoesDisponiveis(grave).includes('cobrar') ? [agir(grave, 'cobrar')] : []), { rotulo: `Ver no mapa: ${grave.titulo}`, tipo: 'focarOcorrencia', payload: { ocorrenciaId: grave.id } }] : [];
    return {
      cenario: t ? t.id : 'porque',
      selo: 'analise',
      texto,
      grafico: graficoAntesDepois(areaId, mostrar, `${a.nome}: mês anterior e últimos 30 dias`),
      ...(foco.length ? { mapa: { tipo: 'destaque', bairros: foco.slice(0, 3), legenda: `${a.nome}: onde ${sentido < 0 ? 'melhorou' : 'piorou'}` } } : {}),
      fontes,
      confiabilidade: confiabilidade(fontes, [areaId]),
      consulta: `SELECT bairro, SUM(data >= hoje() - 30) AS ultimos_30, SUM(data < hoje() - 30) AS mes_anterior FROM gestao.ocorrencias WHERE area = '${areaId}' AND data >= hoje() - 60 GROUP BY bairro`,
      base: { registros: soma(ant) + soma(hist), periodo: 'últimos 60 dias', referencia: referencia() },
      acoes,
    };
  }
  // Sem assunto, "por que piorou?" explica o indicador que mais piorou (dentro da pasta do gestor).
  function areaQueMaisPiorou(ctx) {
    const t = (GC.data.tendencias || []).filter((x) => !x.positivo && anteriorDe(x.area) && (!ctx.areasPerfil || ctx.areasPerfil.includes(x.area)))
      .sort((a, b) => Math.abs(b.variacao) - Math.abs(a.variacao))[0];
    return t ? t.area : null;
  }

  // ---- bairro em qualquer tema: os números do bairro na área do tema, primeiro, e o bairro no mapa ----
  function comBairro(t, r, ent, ctx) {
    if (t.entendeBairro || !ent.bairros.length || !t.origem) return r;
    const areaId = t.origem.areas.find((a) => GC.data.historico30d[a]);
    if (!areaId) return r;
    const hist = GC.data.historico30d[areaId];
    const ordem = ranking(hist).map(([id]) => id);
    const ids = ent.bairros.slice(0, 3);
    const nomeArea = area(areaId).nome;
    const frases = ids.map((id, i) => {
      const n = hist[id] || 0;
      const abertas = (ctx.ocorrencias || []).filter((o) => o.area === areaId && o.bairroId === id).length;
      const casos = n ? `${plural(n, 'caso', 'casos')} de ${nomeArea} em 30 dias (${ordem.indexOf(id) + 1}º entre ${Object.keys(hist).length} bairros)` : `nenhum caso de ${nomeArea} em 30 dias`;
      return `${i ? 'no' : 'No'} bairro ${bairro(id).nome}, ${casos}${abertas ? `, ${abertas} em aberto agora` : ''}`;
    });
    // Comparação (dois bairros ou mais): quem tem mais casos e o gráfico lado a lado, com o mês anterior quando há.
    let comparacao = '';
    if (ids.length >= 2) {
      const maior = ids.slice().sort((a, b) => (hist[b] || 0) - (hist[a] || 0))[0];
      const empate = ids.every((id) => (hist[id] || 0) === (hist[maior] || 0));
      comparacao = empate ? ` Os bairros comparados empatam em casos de ${nomeArea}.` : ` Entre eles, ${bairro(maior).nome} tem mais casos de ${nomeArea}.`;
    }
    const saida = Object.assign({}, r, { texto: `${frases.join('; ')}.${comparacao} ${r.texto}` });
    if (ids.length >= 2) saida.grafico = graficoAntesDepois(areaId, ids, `${nomeArea}: ${nomes(ids.map((id) => bairro(id).nome))}`);
    // "Ver no mapa" aponta para o alerta mais grave do bairro citado, não para o da cidade.
    const doBairro = maisGrave(ctx, (o) => o.area === areaId && ids.includes(o.bairroId));
    if (doBairro) saida.acoes = [...focarPrimeira(ctx, (o) => o.id === doBairro.id), ...(r.acoes || []).filter((x) => x.tipo !== 'focarOcorrencia')];
    if (!r.mapa || r.mapa.tipo === 'destaque') saida.mapa = { tipo: 'destaque', bairros: ids, legenda: `${nomeArea}: ${nomes(ids.map((id) => bairro(id).nome))}` };
    return saida;
  }

  // ---- panorama do bairro: pergunta só com bairro ("Como está o bairro Centro?", "compare Centro e Porto") ----
  // comMes: a pergunta pediu o mês passado ("e no mês passado?" depois de "como está o bairro Centro?").
  function panoramaBairro(ids, ctx, comMes) {
    const dele = (a) => !ctx.areasPerfil || ctx.areasPerfil.includes(a);
    const areasHist = Object.keys(GC.data.historico30d).filter(dele);
    const sat = !ctx.areasPerfil && GC.data.satisfacaoPorBairro;
    const mediaSat = sat ? Math.round(soma(sat) / Object.keys(sat).length) : null;
    const dados = ids.slice(0, 3).map((id) => {
      const abertas = (ctx.ocorrencias || []).filter((o) => o.bairroId === id && dele(o.area));
      const porArea = areasHist.map((a) => [a, GC.data.historico30d[a][id] || 0]);
      const antes = areasHist.reduce((s, a) => s + ((anteriorDe(a) || {})[id] || 0), 0);
      return { id, nome: bairro(id).nome, abertas, antes, criticas: abertas.filter((o) => o.severidade === 'critica').length, porArea, total: porArea.reduce((s, [, n]) => s + n, 0), urgente: maisGrave(ctx, (o) => o.bairroId === id && dele(o.area)), sat: sat ? sat[id] : null };
    });
    const emAberto = (d) => (d.abertas.length ? `${plural(d.abertas.length, 'ocorrência em aberto', 'ocorrências em aberto')}${d.criticas ? ` (${plural(d.criticas, 'crítica', 'críticas')})` : ''}` : 'nenhuma ocorrência em aberto');
    let texto;
    if (dados.length === 1) {
      const d = dados[0];
      const top = d.porArea.filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]).slice(0, 3);
      texto = `O bairro ${d.nome} tem ${emAberto(d)}.${d.urgente ? ` A mais urgente: ${d.urgente.titulo}.` : ''}`
        + `${top.length ? ` Em 30 dias, foram ${plural(d.total, 'caso', 'casos')}, a maioria de ${nomes(top.map(([a, n]) => `${area(a).nome} (${n})`))}.` : ' Nenhum caso registrado em 30 dias.'}`
        + `${d.sat != null ? ` A satisfação dos moradores está em ${d.sat}% (média da cidade: ${mediaSat}%).` : ''}`;
      if (comMes) texto = `No mês anterior, o bairro ${d.nome} teve ${plural(d.antes, 'caso', 'casos')}; nos últimos 30 dias, ${d.total} (${variacao(d.antes, d.total)}). ${texto}`;
    } else {
      const maior = dados.slice().sort((a, b) => b.total - a.total)[0];
      texto = `${dados.map((d) => `${d.nome}: ${emAberto(d)} e ${plural(d.total, 'caso', 'casos')} em 30 dias${comMes ? ` (mês anterior: ${d.antes})` : ''}${d.sat != null ? `, satisfação de ${d.sat}%` : ''}`).join('. ')}. ${maior.nome} concentra mais casos no período.`;
    }
    const comCasos = areasHist.filter((a) => dados.some((d) => (GC.data.historico30d[a][d.id] || 0) > 0 || (comMes && ((anteriorDe(a) || {})[d.id] || 0) > 0)));
    // Um bairro com o mês passado: as duas séries por área. Senão, uma série por bairro.
    const seriesMes = comMes && dados.length === 1
      ? [{ nome: 'Mês anterior', valores: comCasos.map((a) => (anteriorDe(a) || {})[dados[0].id] || 0) }, { nome: 'Últimos 30 dias', valores: comCasos.map((a) => GC.data.historico30d[a][dados[0].id] || 0) }]
      : null;
    const fontes = ['ouvidoria.chamados_156', 'planejamento.bairros'];
    const filtro = (o) => ids.includes(o.bairroId) && dele(o.area);
    return {
      cenario: 'bairro',
      texto,
      ...(comCasos.length ? { grafico: { tipo: 'barra', titulo: `${seriesMes ? 'Casos por área: mês anterior e últimos 30 dias' : 'Casos em 30 dias por área'} · ${nomes(dados.map((d) => d.nome))}`, rotulos: comCasos.map((a) => area(a).nome), series: seriesMes || dados.map((d) => ({ nome: d.nome, valores: comCasos.map((a) => GC.data.historico30d[a][d.id] || 0) })), unidade: 'casos' } } : {}),
      mapa: { tipo: 'destaque', bairros: dados.map((d) => d.id), legenda: nomes(dados.map((d) => d.nome)) },
      fontes,
      confiabilidade: confiabilidade(fontes, areasHist.length ? areasHist : ['infraestrutura']),
      consulta: `SELECT area, COUNT(*) FROM ouvidoria.chamados_156 WHERE bairro IN (${ids.map((id) => `'${id}'`).join(', ')}) AND data >= hoje() - 30 GROUP BY area`,
      base: { registros: dados.reduce((s, d) => s + d.total + d.abertas.length, 0), periodo: 'últimos 30 dias', referencia: referencia() },
      acoes: focarPrimeira(ctx, filtro),
    };
  }

  // Sem tema: pedido ainda sem suporte, temas próximos ("Você quis dizer") ou as sugestões de sempre.
  function semTema(ent, contexto) {
    const perto = proximos(ent, contexto);
    const lista = [...perto.map((c) => c.exemplo), ...sugestoes.filter((s) => !perto.some((c) => c.exemplo === s))].slice(0, 3);
    const doc = { oficio: 'ofícios', comunicado: 'comunicados', nota: 'notas à imprensa', resposta: 'respostas ao cidadão' }[ent.documento] || 'rascunhos';
    let texto;
    if (ent.intencao === 'rascunho') {
      texto = `Ainda não escrevo ${doc} por aqui.${ent.documento === 'comunicado' ? ' O comunicado de uma crise já sai pronto no Gabinete de crise.' : ''} Posso levantar os números para o texto:`;
    } else if (ent.intencao === 'lote') {
      texto = 'Ainda não faço ações em lote pelo chat: cada cobrança sai da gaveta do alerta. Posso mostrar:';
    } else if (ent.continuacao || (ent.periodo && ent.palavras.length <= 5)) {
      // "e no mês passado?" sem pergunta antes nesta conversa: falta o assunto, não o dado.
      texto = `Esta conversa ainda não tem um assunto para eu seguir. Sobre o que você quer saber${ent.periodo ? ` ${DO_PERIODO[ent.periodo.id] || `dos ${ent.periodo.rotulo}`}` : ''}? Posso responder, por exemplo:`;
    } else if (perto.length) {
      texto = 'Não achei essa pergunta nos dados da Prefeitura. Você quis dizer:';
    } else {
      texto = 'Não encontrei isso nos dados da Prefeitura. Posso responder, por exemplo:';
    }
    return { cenario: 'fallback', selo: 'semdado', texto, acoes: sugerir(lista) };
  }

  // ---- memória da conversa (fase 2): contexto.memoria traz os turnos anteriores, do mais antigo ao mais novo ----
  // Cada turno é o "memoria" que a resposta devolveu: { tema, bairros, periodo }. Vale o último com assunto.
  function ultimoTurno(memoria) {
    const lista = Array.isArray(memoria) ? memoria : [];
    for (let i = lista.length - 1; i >= 0; i--) {
      const t = lista[i];
      if (t && ((t.tema && tema(t.tema)) || (Array.isArray(t.bairros) && t.bairros.length))) return t;
    }
    return null;
  }
  // Pergunta que continua a anterior: começa com "e …" ("e no Porto?", "e a segurança?") ou é curta e só traz
  // bairro, período ou comparação ("no mês passado?", "compare com o Porto").
  // Quem diz "bairro" ("como está o bairro Centro?") quer o panorama do bairro, não o assunto anterior.
  const continua = (ent) => ent.continuacao || (ent.palavras.length <= 5 && !ent.intencao && !ent.palavras.includes('bairro')
    && (ent.bairros.length > 0 || !!ent.periodo || ent.comparar));
  const bairroValido = (id) => GC.data.bairros.some((b) => b.id === id);

  // Período que o tema ainda não separa (só os últimos 30 dias e o agora): a Maia diz isso antes dos números.
  // Um tema que já separa um período lista o id em "periodos" (ex.: periodos: ['mes_passado']).
  const PERIODO_PADRAO = ['hoje', 'mes'];
  const DO_PERIODO = { mes_passado: 'do mês passado', semana_passada: 'da semana passada', ontem: 'de ontem', semana: 'desta semana', ano: 'deste ano', ano_passado: 'do ano passado' };
  function comPeriodo(t, r, ent) {
    const p = ent.periodo;
    if (!p || PERIODO_PADRAO.includes(p.id) || (t.periodos || []).includes(p.id)) return r;
    const de = DO_PERIODO[p.id] || `dos ${p.rotulo}`;
    const base = (t.base && t.base.periodo) || 'últimos 30 dias';
    return Object.assign({}, r, { texto: `Ainda não tenho os números ${de} separados neste assunto; abaixo, o quadro atual (${base}). ${r.texto}` });
  }

  // ---- fase 4: ação em lote e rascunhos ----
  // Secretaria do pedido: a citada, a do tema da pergunta, a do tema anterior. O gestor do setor fica na pasta dele.
  function areaDoPedido(ent, ctx, t) {
    const doTema = (x) => x && (x.historico || (x.origem && x.origem.areas.length === 1 ? x.origem.areas[0] : null));
    let a = ent.secretarias[0] || doTema(t) || null;
    if (ctx.areasPerfil && (!a || !ctx.areasPerfil.includes(a))) a = ctx.areasPerfil[0];
    return a;
  }
  const GRAVIDADE = (a, b) => (GC.estourada ? GC.estourada(b) - GC.estourada(a) : 0) || PESO_SEVERIDADE[a.severidade] - PESO_SEVERIDADE[b.severidade];
  const LOTE = {
    cobrar: { verbo: 'cobrar', feita: ['cobrada', 'cobradas'], icone: '📣', efeito: 'A cobrança vai para a secretaria responsável por cada uma e fica no registro.', porque: 'a cobrança vale para prazo estourado, e estas ainda estão no prazo ou já foram cobradas' },
    priorizar: { verbo: 'priorizar', feita: ['priorizada', 'priorizadas'], icone: '⚡', efeito: 'Cada uma sobe na fila da secretaria responsável e fica no registro.', porque: 'já receberam uma ação do gabinete' },
  };
  const MAX_LOTE = 12;
  // Mostra o que vai ser feito e pede confirmação: nada acontece até o botão "Cobrar as N" (ação agirLote).
  function acaoEmLote(ent, ctx, areaId) {
    const L = LOTE[ent.acao];
    const dele = (o) => !ctx.areasPerfil || ctx.areasPerfil.includes(o.area);
    let alvo = (ctx.ocorrencias || []).filter((o) => o.status !== 'resolvida' && dele(o) && (!areaId || o.area === areaId) && (!ent.bairros.length || ent.bairros.includes(o.bairroId)));
    if (ent.severidade) alvo = alvo.filter((o) => o.severidade === ent.severidade);
    if (ent.estourado && GC.estourada) alvo = alvo.filter(GC.estourada);
    const pode = alvo.filter((o) => (GC.acoesDisponiveis ? GC.acoesDisponiveis(o) : []).includes(ent.acao)).sort(GRAVIDADE);
    const escolhidas = pode.slice(0, MAX_LOTE);
    const recorte = [
      ent.severidade ? (alvo.length === 1 ? ' crítica' : ' críticas') : '',
      ent.estourado ? ' com prazo estourado' : '',
      areaId ? ` da ${area(areaId).secretaria.nome}` : '',
      ent.bairros.length ? ` no bairro ${nomes(ent.bairros.map((id) => bairro(id).nome))}` : '',
    ].join('');
    if (!escolhidas.length) {
      return {
        cenario: 'lote',
        texto: alvo.length
          ? `Nenhuma das ${plural(alvo.length, 'ocorrência', 'ocorrências')}${recorte} pode ser ${L.feita[0]} agora: ${L.porque}.`
          : `Não há ocorrências em aberto${recorte} agora.`,
      };
    }
    const n = escolhidas.length;
    const itens = escolhidas.slice(0, 5).map((o) => `${o.titulo} (${bairro(o.bairroId).nome})`);
    const mais = n > 5 ? ` e mais ${n - 5}` : '';
    const fora = alvo.length - pode.length;
    const passou = pode.length > MAX_LOTE ? ` Há ${pode.length} no total; separei as ${MAX_LOTE} mais graves.` : '';
    return {
      cenario: 'lote',
      texto: `Posso ${L.verbo} ${plural(n, 'ocorrência', 'ocorrências')}${recorte}: ${nomes(itens)}${mais}.${passou}${fora > 0 ? ` ${fora === 1 ? 'Outra fica' : `Outras ${fora} ficam`} de fora: ${L.porque}.` : ''} ${L.efeito} Confirma?`,
      mapa: { tipo: 'destaque', bairros: unicos(escolhidas.map((o) => o.bairroId)), legenda: `Para ${L.verbo}` },
      acoes: [{ rotulo: `${L.icone} ${L.verbo.charAt(0).toUpperCase()}${L.verbo.slice(1)} ${n === 1 ? 'esta ocorrência' : `as ${n}`}`, tipo: 'agirLote', payload: { acao: ent.acao, ocorrenciaIds: escolhidas.map((o) => o.id) } }],
    };
  }

  const NOME_DOC = { oficio: 'do ofício de cobrança', comunicado: 'do comunicado à população', nota: 'da nota à imprensa', resposta: 'da resposta ao cidadão', post: 'da legenda do post para redes sociais' };
  const PEDIDO_DOC = { oficio: 'Escreva um ofício cobrando a', comunicado: 'Escreva um comunicado à população sobre', nota: 'Escreva uma nota à imprensa sobre', resposta: 'Escreva uma resposta ao cidadão sobre', post: 'Escreva a legenda do post para as redes sociais sobre' };
  // Secretarias com mais trabalho em aberto agora (estouradas primeiro): as opções quando o pedido não diz qual.
  function secretariasEmAberto(ctx) {
    const cont = {};
    (ctx.ocorrencias || []).filter((o) => o.status !== 'resolvida').forEach((o) => {
      cont[o.area] = cont[o.area] || [0, 0];
      cont[o.area][0] += GC.estourada && GC.estourada(o) ? 1 : 0;
      cont[o.area][1] += 1;
    });
    return Object.entries(cont).sort((a, b) => b[1][0] - a[1][0] || b[1][1] - a[1][1]).map(([id]) => id).filter((id) => area(id));
  }
  // t: tema da pergunta (ou da anterior). No comunicado, a ocorrência do assunto vem antes da mais grave da área
  // ("comunicado sobre isso" depois de alagamentos fala do alagamento, não do barranco da mesma secretaria).
  function pedirRascunho(ent, ctx, areaId, t) {
    const ondeTxt = ent.bairros.length ? ` no bairro ${bairro(ent.bairros[0]).nome}` : '';
    if (!ent.documento) {
      return {
        cenario: 'esclarecer',
        texto: 'Que rascunho você quer?',
        acoes: ['oficio', 'comunicado', 'nota', 'resposta', 'post'].map((d) => ({ rotulo: capitalizar(NOME_DOC[d].replace(/^(do|da) /, '')), tipo: 'perguntar', payload: { texto: `${PEDIDO_DOC[d]} ${areaId ? area(areaId).nome : 'a cidade'}${ondeTxt}`.replace(' sobre a cidade', '') } })),
      };
    }
    if (!areaId && ent.documento !== 'comunicado' && ent.documento !== 'post') {
      const opcoes = secretariasEmAberto(ctx).slice(0, 3);
      return {
        cenario: 'esclarecer',
        texto: `${ent.documento === 'oficio' ? 'Para qual secretaria é o ofício?' : 'Sobre qual secretaria?'} Estas têm mais ocorrências em aberto agora:`,
        acoes: opcoes.map((id) => ({ rotulo: area(id).nome, tipo: 'perguntar', payload: { texto: `${PEDIDO_DOC[ent.documento]} ${area(id).nome}${ondeTxt}` } })),
      };
    }
    const visiveis = (ctx.ocorrencias || []).filter((o) => !ctx.areasPerfil || ctx.areasPerfil.includes(o.area));
    let ocorrencia;
    if (ent.documento === 'comunicado' && t && GC.iaRascunho) {
      const doAssunto = (o) => t.chaves.map(chave).some((k) => casa(normalizar(`${o.titulo} ${o.tipo || ''}`), k));
      ocorrencia = GC.iaRascunho.emAberto(visiveis, areaId, ent.bairros).find(doAssunto);
    }
    const d = GC.iaRascunho && GC.iaRascunho[ent.documento]({ areaId, bairros: ent.bairros, ocorrencias: visiveis, recorte: ent, ocorrencia });
    if (!d) {
      return { cenario: 'rascunho', selo: 'semdado', texto: `Não há ocorrência em aberto${areaId ? ` da ${area(areaId).secretaria.nome}` : ''}${ondeTxt} para comunicar agora.` };
    }
    const fontes = ['gestao.ocorrencias', 'gestao.prazos_sla', 'planejamento.bairros'];
    const primeira = d.ocorrencias[0] && (ctx.ocorrencias || []).find((o) => o.id === d.ocorrencias[0]);
    return {
      cenario: 'rascunho',
      texto: `Rascunho ${NOME_DOC[d.tipo]}${d.tipo === 'oficio' ? ` à ${area(areaId).secretaria.nome}` : ''}, ${d.resumo}. O texto é editável: revise antes de enviar.`,
      documento: { tipo: d.tipo, titulo: d.titulo, texto: d.texto, ...(d.sms ? { sms: d.sms } : {}), ...(d.curto ? { curto: d.curto } : {}) },
      fontes,
      confiabilidade: confiabilidade(fontes, [areaId || (primeira && primeira.area) || 'infraestrutura']),
      acoes: [
        ...(primeira ? [{ rotulo: `Ver no mapa: ${primeira.titulo}`, tipo: 'focarOcorrencia', payload: { ocorrenciaId: primeira.id } }] : []),
        // Post: entra na agenda de publicação esperando aprovação (js/tela-publicacoes.js); nada sai sem uma pessoa aprovar.
        ...(d.tipo === 'post' && GC.publicacoes && GC.publicacoes.daMaia(Object.assign({ area: areaId }, d)) !== undefined ? [{ rotulo: '📣 Ver na agenda de publicação', tipo: 'abrirTela', payload: { rota: { tela: 'publicacoes' } } }] : []),
      ],
    };
  }

  function perguntar(texto, contexto) {
    const foco = contexto && contexto.ocorrenciaFoco && (contexto.ocorrencias || []).find((o) => o.id === contexto.ocorrenciaFoco);
    if (foco) return sobreOcorrencia(foco);
    const ctx = contexto || {};
    const q = normalizar(texto);
    const lido = GC.iaEntender ? GC.iaEntender(texto) : { q, palavras: q.split(/[^a-z0-9]+/).filter(Boolean), bairros: [], secretarias: [], equipamentos: [] };
    const anterior = ultimoTurno(ctx.memoria);
    const seguir = !!anterior && continua(lido);
    // Bairros da continuação: os novos substituem; "compare com o Porto" junta o novo aos anteriores; sem bairro
    // novo, ficam os da pergunta anterior.
    const antigos = seguir ? (anterior.bairros || []).filter(bairroValido) : [];
    const bairros = !seguir ? lido.bairros
      : !lido.bairros.length ? antigos
        : lido.comparar ? [...new Set([...antigos, ...lido.bairros])] : lido.bairros;
    const ent = Object.assign({}, lido, { bairros, periodo: lido.periodo || (seguir ? anterior.periodo || null : null) });
    const memoria = (temaId) => ({ tema: temaId, bairros: ent.bairros.slice(0, 5), periodo: ent.periodo || null });
    const lembrar = (r, temaId) => Object.assign(r, { memoria: memoria(temaId) });
    // Fase 5: a tela aberta (gabinete, relatório, Resumo do dia, gaveta de Alertas) vem em contexto.foco. A resposta
    // da tela (js/ia/foco-*.js) vale para as perguntas sobre ela; as outras (null) seguem para os temas.
    // Pergunta com assunto próprio ("o que fazer com as obras?") vai para o tema; pedido de rascunho fica com a tela.
    const daTela = ctx.foco && (GC.focosIA || {})[ctx.foco.tipo];
    if (daTela && q && (ent.intencao || !pontuar(texto).length)) {
      const r = daTela.responder(ctx.foco, ent, ctx);
      if (r) return lembrar(r, null);
    }
    // Botão da pergunta de volta: o tema já vem escolhido.
    const forcado = ctx.tema && tema(ctx.tema);
    let melhor = forcado && disponivel(forcado) ? forcado : null;
    if (!melhor && q) {
      let lista = pontuar(texto);
      // Gestor de uma secretaria: no empate, fica o tema da pasta dele.
      if (ctx.areasPerfil && lista[1] && lista[1].pontos === lista[0].pontos) {
        const daPasta = lista.filter((x) => x.pontos === lista[0].pontos && x.tema.origem && x.tema.origem.areas.some((a) => ctx.areasPerfil.includes(a)));
        if (daPasta.length === 1) lista = [daPasta[0]];
      }
      if (lista[1] && lista[1].pontos === lista[0].pontos && lista[0].pontos < FORTE) return esclarecer(lista[0], lista[1], texto, ent);
      melhor = lista[0] ? lista[0].tema : null;
    }
    // Sem assunto próprio, a continuação fica no assunto da pergunta anterior ("e no mês passado?").
    if (!melhor && seguir && anterior.tema && tema(anterior.tema) && disponivel(tema(anterior.tema))) melhor = tema(anterior.tema);
    // Ação em lote e rascunho: a secretaria vem da pergunta; sem ela (e sem bairro), da pergunta anterior
    // ("escreva um comunicado sobre isso" depois de "alagamento no Centro").
    if (ent.intencao === 'lote' || ent.intencao === 'rascunho') {
      const temaAnterior = anterior && anterior.tema && tema(anterior.tema);
      const doContexto = !melhor && !ent.secretarias.length && !lido.bairros.length && anterior;
      const e = doContexto ? Object.assign({}, ent, { bairros: (anterior.bairros || []).filter(bairroValido) }) : ent;
      const areaId = areaDoPedido(e, ctx, melhor || (doContexto ? temaAnterior : null));
      const r = ent.intencao === 'lote' ? acaoEmLote(e, ctx, areaId) : pedirRascunho(e, ctx, areaId, melhor || (doContexto ? temaAnterior : null));
      return Object.assign(r, { memoria: { tema: (melhor || (doContexto && temaAnterior) || {}).id || null, bairros: e.bairros.slice(0, 5), periodo: null } });
    }
    // "por que piorou?": o "piorou" casa o resumo, mas a pergunta é sobre a causa. Vale o tema da pergunta (se conta
    // casos), senão o da pergunta anterior, senão o indicador que mais piorou. Bairros: os da pergunta ou os anteriores.
    if (ent.porque && !ent.intencao) {
      const temaAnterior = anterior && anterior.tema && tema(anterior.tema);
      const alvo = melhor && melhor.historico ? melhor : (!melhor || melhor.id === 'resumo') && temaAnterior && temaAnterior.historico ? temaAnterior : null;
      if (alvo || !melhor || melhor.id === 'resumo') {
        const areaId = alvo ? alvo.historico : areaQueMaisPiorou(ctx);
        const ondeBairros = ent.bairros.length ? ent.bairros : (anterior && alvo === temaAnterior ? (anterior.bairros || []).filter(bairroValido) : []);
        const e = Object.assign({}, ent, { bairros: ondeBairros });
        const r = areaId && explicar(areaId, e, ctx, alvo);
        if (r) return Object.assign(r, { memoria: { tema: alvo ? alvo.id : null, bairros: ondeBairros.slice(0, 5), periodo: ent.periodo || null } });
      }
    }
    if (!melhor) {
      if (ent.bairros.length && !ent.intencao) {
        const comMes = ent.periodo && ent.periodo.id === 'mes_passado';
        return lembrar(comPeriodo({ base: { periodo: 'últimos 30 dias' }, periodos: ['mes_passado'] }, panoramaBairro(ent.bairros, ctx, comMes), ent), null);
      }
      if (CUMPRIMENTO.test(q)) {
        // Gestor de uma secretaria: o quadro é só da pasta dele.
        const dele = (o) => !contexto || !contexto.areasPerfil || contexto.areasPerfil.includes(o.area);
        const ativas = ((contexto && contexto.ocorrencias) || []).filter(dele);
        const criticas = ativas.filter((o) => o.severidade === 'critica').length;
        const urgente = maisGrave(contexto || {}, dele);
        const quadro = ativas.length
          ? `Há ${ativas.length} ${ativas.length === 1 ? 'ocorrência' : 'ocorrências'} em aberto, ${criticas} ${criticas === 1 ? 'crítica' : 'críticas'}.${urgente ? ` A mais urgente: ${urgente.titulo} (${bairro(urgente.bairroId).nome}).` : ''}`
          : 'Nenhuma ocorrência em aberto agora.';
        return {
          cenario: 'saudacao',
          texto: `${saudacaoDoDia()}. ${quadro} Por onde quer começar?`,
          acoes: [...focarPrimeira(contexto || {}, dele), ...sugerir(sugestoes.slice(0, 2))],
        };
      }
      return semTema(ent, ctx);
    }
    const base = Object.assign({ cenario: melhor.id }, melhor.responder(ctx, q, ent));
    // Mês passado num tema que conta casos por bairro: responde com os dois meses lado a lado.
    const doMes = ent.periodo && ent.periodo.id === 'mes_passado' && melhor.historico ? mesPassado(melhor, base, ent) : null;
    const resposta = doMes || comPeriodo(melhor, comBairro(melhor, base, ent, ctx), ent);
    const saida = comOrigem(melhor.id, resposta, texto, contexto);
    if (doMes) saida.base = { registros: soma(anteriorDe(melhor.historico)) + soma(GC.data.historico30d[melhor.historico]), periodo: 'últimos 60 dias', referencia: referencia() };
    return lembrar(saida, melhor.id);
  }

  function aoEvento(evento, contexto) {
    const o = evento.ocorrencia;
    if (evento.tipo === 'acao') {
      const n = (GC.data.historico30d[o.area] || {})[o.bairroId] || 0;
      if (n < 2) return null;
      const mapa = calor(o.area, contexto || {}, `Histórico de ${area(o.area).nome} — 30 dias`);
      return {
        cenario: 'evento_acao',
        selo: 'analise',
        texto: `É o ${n}º caso de ${o.tipo} em 30 dias no bairro ${bairro(o.bairroId).nome}, o que indica um problema que se repete. Quer ver o histórico no mapa?`,
        acoes: [{ rotulo: 'Ver histórico no mapa', tipo: 'mostrarMapa', payload: { mapa } }],
      };
    }
    if (evento.tipo === 'nova') {
      return {
        cenario: 'evento_nova',
        texto: `Novo alerta ${SEVERIDADE[o.severidade]}: ${o.titulo} no bairro ${bairro(o.bairroId).nome} (cerca de ${o.afetados.toLocaleString('pt-BR')} pessoas). Já encaminhado à ${area(o.area).secretaria.nome} (prazo ${GC.data.prazoMin[o.severidade] / 60} h).`,
        acoes: [
          agir(o, 'priorizar'),
          { rotulo: 'Ver no mapa', tipo: 'focarOcorrencia', payload: { ocorrenciaId: o.id } },
        ],
      };
    }
    return null;
  }

  // Secretarias de cada tema (o painel do gestor do setor só responde temas da pasta dele).
  const areasDoTema = (id) => { const t = tema(id); return t && t.origem ? t.origem.areas.slice() : null; };

  // pontuar(texto): ranking dos temas para a pergunta (testes e depuração).
  GC.ia = { sugestoes, perguntar, aoEvento, normalizar, areasDoTema, pontuar };
})(window.GC = window.GC || {});
