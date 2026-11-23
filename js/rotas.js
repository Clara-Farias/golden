(function (GC) {
  // Telas por hash (#/painel, #/secretarias, #/secretaria/<area>): funciona via file://,
  // o F5 mantém a tela e o voltar do navegador funciona. Qualquer outra coisa vai ao Painel.
  const PAINEL = { tela: 'painel' };

  const TIPOS = ['executivo', 'secretaria', 'bairro', 'alertas', 'comparacao', 'entregas'];
  const PERIODOS = ['7', '30', '90', '12m'];
  const EXECUTIVO = { tela: 'relatorios', tipo: 'executivo', alvo: '-', periodo: '30' };

  // Períodos que mudam de fato cada relatório. Secretaria: a série é mensal, então 7 dias seria igual a 30.
  // Bairro: os dados por bairro só existem para os últimos 30 dias.
  // Comparação de bairros e de secretarias: 30 dias (com o mês anterior); a de períodos tem os próprios meses.
  const PERIODOS_DO_TIPO = { executivo: PERIODOS, alertas: PERIODOS, secretaria: ['30', '90', '12m'], bairro: ['30'], comparacao: ['30'] };
  GC.periodosDoRelatorio = (tipo) => PERIODOS_DO_TIPO[tipo] || PERIODOS;
  // Intervalo de meses escolhido: 'm<de>-<ate>' com índices da série mensal (0 = nov/2025 ... 11 = out/2026).
  // Vale para todos os tipos menos o bairro (só há dados por bairro dos últimos 30 dias).
  const MESES = /^m(\d{1,2})-(\d{1,2})$/;
  const mesesValidos = (p) => { const m = MESES.exec(String(p)); return !!m && Number(m[1]) <= Number(m[2]) && Number(m[2]) <= 11; };
  GC.aceitaMesesNoRelatorio = (tipo) => tipo !== 'bairro' && tipo !== 'comparacao';
  // Comparação de períodos (alvo 'periodos:…'): o período é o intervalo B, sempre em meses.
  GC.periodoDoRelatorio = (tipo, periodo, alvo) => {
    if (tipo === 'comparacao' && /^periodos:/.test(String(alvo || ''))) return mesesValidos(periodo) ? periodo : 'm9-11';
    return GC.periodosDoRelatorio(tipo).includes(periodo) || (GC.aceitaMesesNoRelatorio(tipo) && mesesValidos(periodo)) ? periodo : '30';
  };

  // #/relatorios/<tipo>/<alvo>/<periodo>; o alvo é a área (secretaria), o bairro (bairro e entregas), ou '-'.
  // Qualquer parte inválida vira o executivo de 30 dias; período que não se aplica ao tipo vira 30 dias.
  // Ajustes do "Montar", depois do período, cada um opcional e nesta ordem:
  //   /sem:<ids>  esconde indicadores e seções;  /sec:<áreas>  recorte de secretarias (executivo e alertas);
  //   /grav:<gravidades>  gravidade das ocorrências (menos alertas);  /cmp  compara com o mês anterior.
  // Pedaço inválido ou que não vale para o tipo é ignorado; recorte com todas as secretarias (ou gravidades) é sem filtro.
  const GRAVIDADES = ['critica', 'alta', 'media'];
  const listaDe = (txt, limpo) => [...new Set(decodeURIComponent(txt).split(',').map((x) => x.toLowerCase().replace(limpo, '')).filter(Boolean))];
  function lerAjustes(tipo, extras) {
    const ajustes = {};
    extras.forEach((x) => {
      if (/^sem:/.test(x)) {
        const ids = listaDe(x.slice(4), /[^a-z0-9-]/g);
        if (ids.length) ajustes.ocultar = ids;
      } else if (/^sec:/.test(x) && (tipo === 'executivo' || tipo === 'alertas' || tipo === 'entregas')) {
        const ids = GC.data.areas.map((a) => a.id).filter((id) => listaDe(x.slice(4), /[^a-z0-9_-]/g).includes(id));
        if (ids.length && ids.length < GC.data.areas.length) ajustes.secretarias = ids;
      } else if (/^grav:/.test(x) && tipo !== 'alertas' && tipo !== 'comparacao' && tipo !== 'entregas') {
        const g = GRAVIDADES.filter((id) => listaDe(x.slice(5), /[^a-z]/g).includes(id));
        if (g.length && g.length < GRAVIDADES.length) ajustes.gravidades = g;
      } else if (x === 'cmp' && tipo !== 'bairro' && tipo !== 'comparacao' && tipo !== 'entregas') ajustes.comparar = true;
    });
    return ajustes;
  }
  // Comparação: o alvo diz o modo ('bairros:a,b', 'secretarias:a,b', 'periodos:m6-8'); alvo inválido abre a padrão.
  function lerComparacao(alvo, periodo, extras) {
    if (!GC.lerAlvoComparacao) return EXECUTIVO;
    let c = GC.lerAlvoComparacao(decodeURIComponent(alvo));
    if (!c) { const pad = GC.comparacaoPadrao(); c = GC.lerAlvoComparacao(pad.alvo); periodo = pad.periodo; }
    const canonico = GC.alvoComparacao(c);
    return Object.assign({ tela: 'relatorios', tipo: 'comparacao', alvo: canonico, periodo: GC.periodoDoRelatorio('comparacao', periodo, canonico) }, lerAjustes('comparacao', extras));
  }
  function lerRelatorio([tipo = 'executivo', alvo = '-', periodo = '30', ...extras]) {
    if (tipo === 'comparacao') return lerComparacao(alvo, periodo, extras);
    if (!TIPOS.includes(tipo) || !(PERIODOS.includes(periodo) || mesesValidos(periodo))) return EXECUTIVO;
    if (tipo === 'secretaria' && !GC.data.areas.some((a) => a.id === alvo)) return EXECUTIVO;
    if (tipo === 'bairro' && !GC.data.bairros.some((b) => b.id === alvo)) return EXECUTIVO;
    // Entregas: o alvo é um bairro ou '-' (a cidade inteira); bairro que não existe vira a cidade.
    const alvoEntregas = GC.data.bairros.some((b) => b.id === alvo) ? alvo : '-';
    const rota = { tela: 'relatorios', tipo, alvo: tipo === 'secretaria' || tipo === 'bairro' ? alvo : tipo === 'entregas' ? alvoEntregas : '-', periodo: GC.periodoDoRelatorio(tipo, periodo) };
    return Object.assign(rota, lerAjustes(tipo, extras));
  }
  const hashAjustes = (r) => [
    r.ocultar && r.ocultar.length ? `/sem:${r.ocultar.join(',')}` : '',
    r.secretarias && r.secretarias.length && r.secretarias.length < GC.data.areas.length ? `/sec:${r.secretarias.join(',')}` : '',
    r.gravidades && r.gravidades.length && r.gravidades.length < GRAVIDADES.length ? `/grav:${r.gravidades.join(',')}` : '',
    r.comparar ? '/cmp' : '',
  ].join('');

  GC.lerRota = function (hash) {
    const partes = String(hash || '').replace(/^#\/?/, '').split('/');
    if (partes[0] === 'secretarias' && partes.length === 1) return { tela: 'secretarias' };
    // Visão geral com uma secretaria escolhida (chip ou linha do ranking): #/secretarias/<área>.
    if (partes[0] === 'secretarias' && partes.length === 2 && GC.data.areas.some((a) => a.id === partes[1])) return { tela: 'secretarias', area: partes[1] };
    if (partes[0] === 'secretaria' && GC.data.areas.some((a) => a.id === partes[1])) return { tela: 'secretaria', area: partes[1] };
    if (partes[0] === 'relatorios') return lerRelatorio(partes.slice(1));
    if (partes[0] === 'alertas' && partes.length === 1) return { tela: 'alertas' };
    if (partes[0] === 'cidadao' && partes.length === 1) return { tela: 'cidadao' }; // "Para você" (perfil Cidadão)
    // Minha conta e Auditoria (js/tela-conta.js, js/tela-auditoria.js).
    if (partes[0] === 'conta' && partes.length === 1) return { tela: 'conta' };
    // Auditoria com filtros: #/auditoria[/periodo:1|30|tudo][/tipo:<grupo>][/acao:<ação>][/sec:<área>][/pessoa:<id>]
    // [/atencao][/entradas]. Sem período, os 7 dias; sem /entradas, as entradas e saídas ficam escondidas.
    // Os valores são validados pela tela; a busca por texto não vai para o endereço.
    if (partes[0] === 'auditoria' && partes.length <= 8) {
      const r = { tela: 'auditoria' };
      partes.slice(1).forEach((p) => {
        if (p === 'atencao') { r.atencao = true; return; }
        if (p === 'entradas') { r.entradas = true; return; }
        const m = /^(periodo|tipo|acao|sec|pessoa):(.+)$/.exec(p);
        if (m) r[m[1]] = decodeURIComponent(m[2]);
      });
      return r;
    }
    // Histórico de cobranças (js/tela-cobrancas.js).
    // Com filtros: #/cobrancas[/periodo:7|90|tudo][/sit:<situação>][/sec:<área>][/recobradas]. Sem período, os 30 dias.
    // Os valores são validados pela tela; a busca por texto não vai para o endereço.
    if (partes[0] === 'cobrancas' && partes.length <= 5) {
      const r = { tela: 'cobrancas' };
      partes.slice(1).forEach((p) => {
        if (p === 'recobradas') { r.recobradas = true; return; }
        const m = /^(periodo|sit|sec):(.+)$/.exec(p);
        if (m) r[m[1]] = decodeURIComponent(m[2]);
      });
      return r;
    }
    // Parâmetros de prazo (js/tela-prazos.js).
    if (partes[0] === 'prazos' && partes.length === 1) return { tela: 'prazos' };
    // Personalização (js/tela-personalizar.js): aparência pessoal, da pasta ou de todos; nome e logo.
    if (partes[0] === 'personalizar' && partes.length === 1) return { tela: 'personalizar' };
    // Usuários e permissões (js/tela-usuarios.js): #/usuarios (pessoas) e os perfis de acesso
    // (js/tela-perfis.js): #/usuarios/perfis (lista), #/usuarios/perfis/<id> (ver ou editar) e
    // #/usuarios/perfis/novo/<base> (duplicar). O id é validado pela tela (os perfis criados vivem no navegador).
    if (partes[0] === 'usuarios' && partes[1] === 'perfis' && partes.length <= 4) {
      const id = partes[2] ? decodeURIComponent(partes[2]) : null;
      return { tela: 'usuarios', aba: 'perfis', perfil: id, base: id === 'novo' && partes[3] ? decodeURIComponent(partes[3]) : null };
    }
    // #/usuarios/permissoes (a matriz, que saiu) abre os perfis.
    if (partes[0] === 'usuarios' && partes[1] === 'permissoes' && partes.length === 2) return { tela: 'usuarios', aba: 'perfis', perfil: null, base: null };
    if (partes[0] === 'usuarios' && partes.length <= 2) return { tela: 'usuarios', aba: 'pessoas' };
    // Regras de alerta (js/tela-regras.js): #/regras (lista), #/regras/<id> (editor), #/regras/nova[/<base>] (nova ou duplicar).
    // O id é validado pela tela (as regras criadas vivem no navegador).
    if (partes[0] === 'regras' && partes.length <= 3) {
      const id = partes[1] ? decodeURIComponent(partes[1]) : null;
      return { tela: 'regras', id, base: id === 'nova' && partes[2] ? decodeURIComponent(partes[2]) : null };
    }
    // O id do gabinete é validado pela tela (os gabinetes vivem na memória da demo).
    // Indicadores: o alvo é uma secretaria (filtra) ou um código do catálogo (abre a ficha); a tela valida.
    if (partes[0] === 'indicadores') return { tela: 'indicadores', alvo: partes[1] ? decodeURIComponent(partes[1]) : null };
    // Cruzamento de dados: os dois indicadores são validados pela tela (o perfil decide quais existem).
    if (partes[0] === 'cruzamento' && partes.length <= 3) return { tela: 'cruzamento', a: partes[1] ? decodeURIComponent(partes[1]) : null, b: partes[2] ? decodeURIComponent(partes[2]) : null };
    // Agenda de entregas: #/entregas[/<aaaa-mm>][/pasta:<id>][/bairro:<id>][/ver:<lista>][/sit:<situação>]. Sem mês,
    // o de hoje. Os filtros só entram no objeto quando estão na rota (a tela valida pasta, bairro, lista e situação).
    if (partes[0] === 'entregas' && partes.length <= 6) {
      const r = { tela: 'entregas', mes: /^\d{4}-(0[1-9]|1[0-2])$/.test(partes[1] || '') ? partes[1] : null };
      partes.slice(1).forEach((p) => {
        const m = /^(pasta|bairro|ver|sit):(.+)$/.exec(p);
        if (m) r[m[1]] = decodeURIComponent(m[2]);
      });
      return r;
    }
    // Plano de governo (js/tela-metas.js): #/metas, #/metas/<secretaria> e #/metas/<secretaria ou ->/<meta> (abre a ficha
    // da meta; "-" = todas as secretarias). A tela valida a secretaria e a meta.
    if (partes[0] === 'metas' && partes.length <= 3) {
      const r = { tela: 'metas', area: partes[1] && partes[1] !== '-' ? decodeURIComponent(partes[1]) : null };
      if (partes[2]) r.id = decodeURIComponent(partes[2]);
      return r;
    }
    // Orçamento e contratos (js/tela-orcamento.js): #/orcamento ou #/orcamento/<secretaria>. A tela valida a pasta.
    // Telas da revisão de 23/11: agenda de publicação, governança da Maia, fontes e integrações.
    if (['publicacoes', 'governanca', 'fontes'].includes(partes[0]) && partes.length === 1) return { tela: partes[0] };
    if (partes[0] === 'orcamento' && partes.length <= 2) return { tela: 'orcamento', area: partes[1] ? decodeURIComponent(partes[1]) : null };
    // Calendário sazonal: #/sazonal (mês de hoje) ou #/sazonal/<mês curto> (jan … dez).
    // Demandas (js/tela-tarefas.js): #/demandas ou #/demandas/<id> (abre a demanda; a tela valida o id). #/tarefas, o
    // nome de antes, continua valendo.
    if ((partes[0] === 'demandas' || partes[0] === 'tarefas') && partes.length <= 2) return { tela: 'tarefas', id: partes[1] ? decodeURIComponent(partes[1]) : null };
    // Configuração: #/sazonal/config, #/sazonal/config/<id> (editar), #/sazonal/config/nova[/<base>] (nova ou duplicar).
    if (partes[0] === 'sazonal' && partes[1] === 'config' && partes.length <= 4) {
      const temporada = partes[2] ? decodeURIComponent(partes[2]) : null;
      return { tela: 'sazonal', mes: null, config: true, temporada, base: temporada === 'nova' && partes[3] ? decodeURIComponent(partes[3]) : null };
    }
    if (partes[0] === 'sazonal' && partes.length <= 2) return { tela: 'sazonal', mes: /^(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)$/.test(partes[1] || '') ? partes[1] : null };
    // Modelos de gabinete: #/crise/modelos, #/crise/modelos/<id> (editar) e #/crise/modelos/novo/<base> (duplicar).
    if (partes[0] === 'crise' && partes[1] === 'modelos') {
      const modelo = partes[2] ? decodeURIComponent(partes[2]) : null;
      return { tela: 'crise', id: null, modelos: true, modelo, base: modelo === 'novo' && partes[3] ? decodeURIComponent(partes[3]) : null };
    }
    if (partes[0] === 'crise') return { tela: 'crise', id: partes[1] ? decodeURIComponent(partes[1]) : null };
    // A tabela é validada pela tela (ela conhece as tabelas); id desconhecido abre a primeira.
    if (partes[0] === 'dados') return { tela: 'dados', tabela: partes[1] ? decodeURIComponent(partes[1]) : null };
    // Tela que não existe: aviso "Página não encontrada" (vazio, #/ e #/painel continuam sendo o Painel).
    if (partes[0] && partes[0] !== 'painel') return { tela: 'nao-encontrada', caminho: `#/${partes.join('/')}` };
    return PAINEL;
  };

  GC.hashDe = function (rota) {
    if (rota.tela === 'secretaria') return `#/secretaria/${rota.area}`;
    if (rota.tela === 'secretarias') return rota.area ? `#/secretarias/${rota.area}` : '#/secretarias';
    if (rota.tela === 'dados') return rota.tabela ? `#/dados/${rota.tabela}` : '#/dados';
    if (rota.tela === 'indicadores') return rota.alvo ? `#/indicadores/${encodeURIComponent(rota.alvo)}` : '#/indicadores';
    if (rota.tela === 'cruzamento') return rota.a && rota.b ? `#/cruzamento/${encodeURIComponent(rota.a)}/${encodeURIComponent(rota.b)}` : '#/cruzamento';
    if (rota.tela === 'entregas') {
      const extra = ['pasta', 'bairro', 'ver', 'sit'].filter((k) => rota[k]).map((k) => `/${k}:${encodeURIComponent(rota[k])}`).join('');
      return `#/entregas${rota.mes ? `/${rota.mes}` : ''}${extra}`;
    }
    if (rota.tela === 'auditoria') {
      const extra = ['periodo', 'tipo', 'acao', 'sec', 'pessoa'].filter((k) => rota[k]).map((k) => `/${k}:${encodeURIComponent(rota[k])}`).join('');
      return `#/auditoria${extra}${rota.atencao ? '/atencao' : ''}${rota.entradas ? '/entradas' : ''}`;
    }
    if (rota.tela === 'cobrancas') {
      const extra = ['periodo', 'sit', 'sec'].filter((k) => rota[k]).map((k) => `/${k}:${encodeURIComponent(rota[k])}`).join('');
      return `#/cobrancas${extra}${rota.recobradas ? '/recobradas' : ''}`;
    }
    if (rota.tela === 'metas') return rota.id ? `#/metas/${rota.area ? encodeURIComponent(rota.area) : '-'}/${encodeURIComponent(rota.id)}` : rota.area ? `#/metas/${encodeURIComponent(rota.area)}` : '#/metas';
    if (['publicacoes', 'governanca', 'fontes'].includes(rota.tela)) return `#/${rota.tela}`;
    if (rota.tela === 'orcamento') return rota.area ? `#/orcamento/${encodeURIComponent(rota.area)}` : '#/orcamento';
    if (rota.tela === 'tarefas') return rota.id ? `#/demandas/${encodeURIComponent(rota.id)}` : '#/demandas';
    if (rota.tela === 'sazonal' && rota.config) return `#/sazonal/config${rota.temporada ? `/${encodeURIComponent(rota.temporada)}${rota.temporada === 'nova' && rota.base ? `/${encodeURIComponent(rota.base)}` : ''}` : ''}`;
    if (rota.tela === 'sazonal') return rota.mes ? `#/sazonal/${rota.mes}` : '#/sazonal';
    if (rota.tela === 'crise' && rota.modelos) return `#/crise/modelos${rota.modelo ? `/${encodeURIComponent(rota.modelo)}${rota.modelo === 'novo' && rota.base ? `/${encodeURIComponent(rota.base)}` : ''}` : ''}`;
    if (rota.tela === 'crise') return rota.id ? `#/crise/${encodeURIComponent(rota.id)}` : '#/crise';
    if (rota.tela === 'regras') return rota.id ? `#/regras/${encodeURIComponent(rota.id)}${rota.id === 'nova' && rota.base ? `/${encodeURIComponent(rota.base)}` : ''}` : '#/regras';
    if (rota.tela === 'usuarios' && rota.aba === 'perfis') {
      if (!rota.perfil) return '#/usuarios/perfis';
      return `#/usuarios/perfis/${encodeURIComponent(rota.perfil)}${rota.perfil === 'novo' && rota.base ? `/${encodeURIComponent(rota.base)}` : ''}`;
    }
    if (rota.tela === 'usuarios') return '#/usuarios';
    if (rota.tela === 'nao-encontrada') return rota.caminho || '#/nao-encontrada';
    if (rota.tela === 'relatorios') return `#/relatorios/${rota.tipo}/${rota.alvo}/${rota.periodo}${hashAjustes(rota)}`;
    return `#/${rota.tela}`;
  };

  GC.criarRotas = function (aoMudar) {
    let atual = GC.lerRota(location.hash);
    window.addEventListener('hashchange', () => {
      atual = GC.lerRota(location.hash);
      aoMudar(atual);
    });
    return {
      atual: () => atual,
      ir(rota) {
        const hash = GC.hashDe(rota);
        if (location.hash === hash) aoMudar(atual);
        else location.hash = hash;
      },
      iniciar() { aoMudar(atual); },
    };
  };
})(window.GC = window.GC || {});
