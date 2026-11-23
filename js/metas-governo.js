(function (GC) {
  // Metas do plano de governo ligadas aos dados (spec: docs/specs/2026-11-12-vila-dourada-metas-governo-design.md).
  // Só lógica, sem DOM. As metas de js/data-secretarias.js são o padrão de fábrica e não mudam: o registro guarda
  // sobreposições (título, prazo, vínculo), metas criadas, removidas e os informes de progresso da pasta.
  // GC.metasGoverno.alinhar() reescreve no lugar GC.data.secretarias[área].metas com os números calculados: quem já
  // lê esse array (página da secretaria, desempenho, relatórios, store, calendário sazonal, agenda de entregas)
  // recebe o número calculado sem mudar nada.

  const INICIO_MANDATO = '2025-01';
  // Pontos atrás do esperado pelo tempo corrido. Com o mandato começando em jan/2025 e quase tudo vencendo em dez/2026,
  // o esperado em novembro já passa de 90%: limites menores poriam dois terços das metas em crítica.
  const LIMITE_CRITICO_PP = 40;
  const LIMITE_ATENCAO_PP = 15;
  const CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const MES = /^\d{4}-(0[1-9]|1[0-2])$/;
  const texto = (t) => String(t == null ? '' : t).trim();
  const falha = (motivo) => ({ ok: false, motivo });
  const clamp = (n) => Math.max(0, Math.min(100, Math.round(n)));
  const mesesEntre = (de, ate) => { const [a1, m1] = de.split('-').map(Number); const [a2, m2] = ate.split('-').map(Number); return (a2 - a1) * 12 + (m2 - m1); };
    const somarMeses = (mes, n) => { const t = +mes.slice(0, 4) * 12 + (+mes.slice(5, 7) - 1) + n; return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`; };
  // 'dez/2026' e '2026-12', nos dois sentidos
  const deTexto = (p) => { const m = /^([a-z]{3})\/(\d{4})$/.exec(String(p || '')); const k = m ? CURTOS.indexOf(m[1]) : -1; return k >= 0 ? `${m[2]}-${String(k + 1).padStart(2, '0')}` : null; };
  const paraTexto = (mes) => `${CURTOS[+mes.slice(5, 7) - 1]}/${mes.slice(0, 4)}`;
  GC.mesDaMetaGoverno = deTexto;
  GC.textoMesMetaGoverno = paraTexto;
  // Os prazos do arquivo acompanham o relógio da demonstração (como as outras datas escritas contra a âncora).
  const deslocamento = () => (GC.relogio ? Math.round(GC.relogio.deltaDias / 30.4375) : 0);
  const hojeIso = () => (GC.relogio ? GC.relogio.hoje : new Date().toISOString().slice(0, 10));
  const utc = (iso) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10) || 1);

  // Vínculos de fábrica, pelo título da meta (o mesmo título que o sazonal e as entregas citam).
  const VINCULOS_PADRAO = {
    'Reduzir a espera nas UBS para 60 min': { tipo: 'indicador', id: 'SAU03', de: 82, ate: 60 },
    'Reduzir ocorrências em 20%': { tipo: 'serie', area: 'seguranca', reducaoPct: 20 },
    'Inaugurar a UBS Bela Vista': { tipo: 'entregas', ids: ['cq-01'] },
    'Base da Guarda no Porto': { tipo: 'entregas', ids: ['cq-05'] },
    'Bilhete único digital': { tipo: 'entregas', ids: ['en-bilhete-digital'] },
    'Matrícula 100% online': { tipo: 'entregas', ids: ['en-matricula-online'] },
    'Lembrete por WhatsApp em todas as UBS': { tipo: 'entregas', ids: ['en-whatsapp-ubs'] },
  };
  GC.VINCULOS_META_GOVERNO = VINCULOS_PADRAO;
  GC.STATUS_META_GOVERNO = { concluida: 'Concluído', em_dia: 'Em dia', atencao: 'Atenção', critico: 'Crítico' };
  GC.TIPOS_VINCULO_META = { informada: 'Informada pela pasta', indicador: 'Indicador do catálogo', serie: 'Série da secretaria', entregas: 'Entregas da agenda' };

  // As metas do arquivo, uma vez (antes de o primeiro alinhar reescrever os arrays). id: mg-<área>-<n>.
  function fabrica() {
    if (GC._metasGovernoFabrica) return GC._metasGovernoFabrica;
    const secs = (GC.data && GC.data.secretarias) || {};
    const lista = [];
    Object.keys(secs).forEach((area) => (secs[area].metas || []).forEach((m, k) => lista.push({
      id: m.id || `mg-${area}-${k + 1}`, area, titulo: m.titulo, prazoMes: deTexto(m.prazo), inicio: INICIO_MANDATO,
      vinculo: VINCULOS_PADRAO[m.titulo] || { tipo: 'informada' }, progressoInicial: m.progressoPct, origem: 'fabrica',
    })));
    GC._metasGovernoFabrica = lista;
    return lista;
  }

  // ---- cálculo ----
  // Status pelo ritmo (decisão 2): concluída, crítica (prazo vencido ou muito atrás do esperado), atenção, em dia.
  GC.statusMetaGoverno = function ({ progressoPct, prazoMes, inicio = INICIO_MANDATO }, hoje = hojeIso()) {
    const ini = utc(`${inicio}-01`);
    const fim = utc(`${somarMeses(prazoMes, 1)}-01`) - 1; // fim do mês do prazo
    const t = utc(hoje);
    const esperadoPct = fim <= ini ? 100 : clamp(((t - ini) / (fim - ini)) * 100);
    if (progressoPct >= 100) return { status: 'concluida', esperadoPct, vencida: false };
    if (t > fim) return { status: 'critico', esperadoPct, vencida: true };
    const atras = esperadoPct - progressoPct;
    return { status: atras > LIMITE_CRITICO_PP ? 'critico' : atras > LIMITE_ATENCAO_PP ? 'atencao' : 'em_dia', esperadoPct, vencida: false };
  };

  const fmt = (v, u) => (GC.formatarIndicador ? GC.formatarIndicador(v, u) : `${v} ${u}`);
  const umaCasa = (n) => Math.round(n * 10) / 10;
  function indicadoresDa(area, cache) {
    if (!cache[area]) {
      try { cache[area] = GC.avaliarIndicadores(GC.contextoIndicadores(GC.storeAtual || null), { area }); } catch (e) { cache[area] = []; }
    }
    return cache[area];
  }
  function entregasTodas(cache) {
    if (!cache.entregas) { try { cache.entregas = GC.entregas ? GC.entregas.lista() : []; } catch (e) { cache.entregas = []; } }
    return cache.entregas;
  }
  // Progresso de um caminho de `de` até `ate`, pelo valor de agora (vale para "reduzir" e "aumentar").
  const caminho = (de, ate, v) => (de === ate ? (v === ate ? 100 : 0) : clamp(((de - v) / (de - ate)) * 100));
  const PIOR_ENTREGA = { parada: 'critico', atrasada: 'critico', em_risco: 'atencao' };

  // Uma meta (definição + informes) → { progressoPct, status, esperadoPct, fonte: { tipo, texto }, entregas }.
  function calcular(d, informes, cache) {
    const v = d.vinculo || { tipo: 'informada' };
    const relacionadas = entregasTodas(cache).filter((e) => e.meta && e.meta.titulo === d.titulo && e.area === d.area)
      .map((e) => ({ id: e.id, titulo: e.titulo, situacao: e.situacao, dataAtual: e.dataAtual }));
    let progressoPct = null;
    let fonte = null;
    let statusEntrega = null;
    if (v.tipo === 'indicador') {
      const i = indicadoresDa((GC.CATALOGO_INDICADORES.find((x) => x.id === v.id) || {}).area || d.area, cache).find((x) => x.id === v.id);
      if (i && typeof i.valorAtual === 'number') {
        progressoPct = caminho(v.de, v.ate, i.valorAtual);
        fonte = { tipo: 'indicador', texto: `${i.nome}: ${fmt(i.valorAtual, i.unidade)} agora, de ${fmt(v.de, i.unidade)} para ${fmt(v.ate, i.unidade)}` };
      }
    } else if (v.tipo === 'serie') {
      const s = ((GC.data.secretarias || {})[v.area || d.area] || {}).serie;
      if (s && s.meses.length) {
        const de = v.de != null ? v.de : s.meses[0];
        const ate = v.ate != null ? v.ate : umaCasa(de * (1 - (v.reducaoPct || 0) / 100));
        const atual = s.meses[s.meses.length - 1];
        progressoPct = caminho(de, ate, atual);
        fonte = { tipo: 'serie', texto: `${s.rotulo}: ${fmt(atual, s.unidade)} no último mês, de ${fmt(de, s.unidade)} para ${fmt(ate, s.unidade)}` };
      }
    } else if (v.tipo === 'entregas') {
      const es = entregasTodas(cache).filter((e) => (v.ids || []).includes(e.id));
      if (es.length) {
        progressoPct = clamp(es.reduce((t, e) => t + (e.situacao === 'entregue' ? 100 : typeof e.avancoPct === 'number' ? e.avancoPct : 0), 0) / es.length);
        const abertas = es.filter((e) => e.situacao !== 'entregue');
        statusEntrega = !abertas.length ? 'concluida' : abertas.map((e) => PIOR_ENTREGA[e.situacao]).find((s) => s === 'critico') || abertas.map((e) => PIOR_ENTREGA[e.situacao]).find(Boolean) || null;
        const rot = (e) => (GC.entregas && GC.entregas.situacaoEmPalavras ? GC.entregas.situacaoEmPalavras(e) : e.situacao);
        fonte = { tipo: 'entregas', texto: es.map((e) => `${e.titulo}: ${rot(e)}`).join(' · ') };
      }
    }
    let informe = null;
    if (progressoPct === null) {
      // Informada (ou vínculo sem dado agora): o último informe da pasta; sem informe, o número do arquivo.
      const lista = informes || [];
      informe = lista.length ? lista[lista.length - 1] : (d.progressoInicial != null ? { progressoPct: d.progressoInicial, nota: 'Dados iniciais do plano de governo', em: null, quem: '' } : { progressoPct: 0, nota: 'Sem informe ainda', em: null, quem: '' });
      progressoPct = informe.progressoPct;
      fonte = { tipo: 'informada', texto: informe.em ? `Informado pela pasta em ${new Date(informe.em).toLocaleDateString('pt-BR')}${informe.quem ? ` (${informe.quem})` : ''}: ${informe.nota}` : informe.nota };
    }
    const r = GC.statusMetaGoverno({ progressoPct, prazoMes: d.prazoMes, inicio: d.inicio || INICIO_MANDATO });
    let status = r.status;
    // Meta de entrega segue a entrega: entregue = concluída; atrasada ou parada = crítica; em risco = no mínimo atenção.
    if (statusEntrega === 'concluida') status = 'concluida';
    else if (statusEntrega === 'critico') status = 'critico';
    else if (statusEntrega === 'atencao' && status === 'em_dia') status = 'atencao';
    return { progressoPct, status, esperadoPct: r.esperadoPct, vencida: r.vencida && status !== 'concluida', fonte, informe, entregas: relacionadas };
  }

  GC.criarMetasGoverno = function ({ armazenamento, agora = () => (GC.agora ? GC.agora() : Date.now()), chave = 'gc.metasGoverno' } = {}) {
    const memoria = {};
    const A = armazenamento || { ler: (k) => memoria[k], gravar: (k, v) => { memoria[k] = JSON.parse(JSON.stringify(v)); } };
    const vazio = () => ({ sobre: {}, criadas: [], informes: {} });
    const ler = () => { const v = A.ler(chave); return v && typeof v === 'object' && v.sobre ? v : vazio(); };
    const ouvintes = new Set();
    const emitir = (tipo, extra) => ouvintes.forEach((fn) => fn(Object.assign({ tipo }, extra)));
    let api;
    function mudar(fn, evento) {
      const d = ler();
      const r = fn(d) || {};
      if (r.ok === false) return r;
      A.gravar(chave, d);
      if (GC.metasGoverno === api) api.alinhar();
      emitir(evento, r);
      return Object.assign({ ok: true }, r);
    }

    // Definições: as do arquivo (com o prazo deslocado pelo relógio e as sobreposições) e as criadas.
    function definicoes(d = ler()) {
      const desl = deslocamento();
      const fab = fabrica().map((f) => {
        const s = d.sobre[f.id] || {};
        return Object.assign({}, f, { prazoMes: f.prazoMes ? somarMeses(f.prazoMes, desl) : null }, s.titulo ? { titulo: s.titulo } : {}, s.prazoMes ? { prazoMes: s.prazoMes } : {},
          s.vinculo ? { vinculo: s.vinculo } : {}, { removida: !!s.removida, alterada: !!(s.titulo || s.prazoMes || s.vinculo), tituloOriginal: f.titulo });
      });
      return [...fab, ...d.criadas.map((c) => Object.assign({ origem: 'criada', removida: false, alterada: false, inicio: c.inicio || INICIO_MANDATO }, c))];
    }

    // Validação do vínculo (null = válido).
    function erroVinculo(v, area) {
      if (!v || v.tipo === 'informada') return null;
      if (v.tipo === 'indicador') {
        const i = (GC.CATALOGO_INDICADORES || []).find((x) => x.id === v.id);
        if (!i || !i.area) return 'vinculo_indicador';
        if (!Number.isFinite(Number(v.de)) || !Number.isFinite(Number(v.ate)) || Number(v.de) === Number(v.ate)) return 'vinculo_valores';
        return null;
      }
      if (v.tipo === 'serie') {
        const s = ((GC.data.secretarias || {})[v.area || area] || {}).serie;
        if (!s) return 'vinculo_serie';
        if (v.reducaoPct != null ? !(Number(v.reducaoPct) > 0 && Number(v.reducaoPct) <= 100) : !(Number.isFinite(Number(v.ate)))) return 'vinculo_valores';
        return null;
      }
      if (v.tipo === 'entregas') {
        if (!Array.isArray(v.ids) || !v.ids.length) return 'vinculo_entregas';
        const ids = GC.entregas ? GC.entregas.lista().map((e) => e.id) : null;
        if (ids && v.ids.some((id) => !ids.includes(id))) return 'vinculo_entregas';
        return null;
      }
      return 'vinculo';
    }
    const limparVinculo = (v) => {
      if (!v || v.tipo === 'informada') return { tipo: 'informada' };
      if (v.tipo === 'indicador') return { tipo: 'indicador', id: v.id, de: Number(v.de), ate: Number(v.ate) };
      if (v.tipo === 'serie') return v.reducaoPct != null ? { tipo: 'serie', area: v.area, reducaoPct: Number(v.reducaoPct) } : { tipo: 'serie', area: v.area, de: v.de != null ? Number(v.de) : undefined, ate: Number(v.ate) };
      return { tipo: 'entregas', ids: v.ids.slice() };
    };

    api = {
      definicoes: () => definicoes(),
      // Metas calculadas. area: só a pasta (null = todas). removidas: inclui as do arquivo removidas (para restaurar).
      lista({ area = null, removidas = false } = {}) {
        const d = ler();
        const cache = {};
        return definicoes(d).filter((x) => (!area || x.area === area) && (removidas || !x.removida))
          .map((x) => Object.assign({}, x, { prazo: x.prazoMes ? paraTexto(x.prazoMes) : '', informes: (d.informes[x.id] || []).slice() }, calcular(x, d.informes[x.id], cache)));
      },
      buscar(id) { return api.lista({ removidas: true }).find((m) => m.id === id) || null; },

      // meta: { area, titulo, prazoMes 'aaaa-mm', vinculo? }
      criar(meta = {}, quem = '') {
        if (!(GC.data.areas || []).some((a) => a.id === meta.area)) return falha('area');
        if (!texto(meta.titulo)) return falha('titulo');
        if (!MES.test(String(meta.prazoMes || ''))) return falha('prazo');
        const ev = erroVinculo(meta.vinculo, meta.area);
        if (ev) return falha(ev);
        return mudar((d) => {
          if (definicoes(d).some((x) => x.area === meta.area && !x.removida && x.titulo.toLowerCase() === texto(meta.titulo).toLowerCase())) return falha('titulo_repetido');
          const n = d.criadas.reduce((m, c) => Math.max(m, Number(c.id.split('-').pop()) || 0), 0) + 1;
          const c = { id: `mg-c-${n}`, area: meta.area, titulo: texto(meta.titulo), prazoMes: meta.prazoMes, inicio: meta.inicio && MES.test(meta.inicio) ? meta.inicio : INICIO_MANDATO, vinculo: limparVinculo(meta.vinculo), criadaPor: quem, criadaEm: agora() };
          d.criadas.push(c);
          return { meta: c };
        }, 'criada');
      },
      // mudanca: { titulo?, prazoMes?, vinculo? }
      editar(id, mudanca = {}, quem = '') {
        if (mudanca.titulo !== undefined && !texto(mudanca.titulo)) return falha('titulo');
        if (mudanca.prazoMes !== undefined && !MES.test(String(mudanca.prazoMes || ''))) return falha('prazo');
        return mudar((d) => {
          const def = definicoes(d).find((x) => x.id === id);
          if (!def || def.removida) return falha('meta');
          if (mudanca.vinculo !== undefined) { const ev = erroVinculo(mudanca.vinculo, def.area); if (ev) return falha(ev); }
          const novo = {};
          if (mudanca.titulo !== undefined && texto(mudanca.titulo) !== def.titulo) novo.titulo = texto(mudanca.titulo);
          if (mudanca.prazoMes !== undefined && mudanca.prazoMes !== def.prazoMes) novo.prazoMes = mudanca.prazoMes;
          if (mudanca.vinculo !== undefined && JSON.stringify(limparVinculo(mudanca.vinculo)) !== JSON.stringify(def.vinculo)) novo.vinculo = limparVinculo(mudanca.vinculo);
          if (!Object.keys(novo).length) return falha('sem_mudanca');
          if (def.origem === 'criada') Object.assign(d.criadas.find((c) => c.id === id), novo, { editadaPor: quem, editadaEm: agora() });
          else d.sobre[id] = Object.assign({}, d.sobre[id], novo, { editadaPor: quem, editadaEm: agora() });
          return { id, mudanca: novo };
        }, 'editada');
      },
      // Criada: apagada de vez. Do arquivo: some da lista e pode ser restaurada.
      remover(id, quem = '') {
        return mudar((d) => {
          const def = definicoes(d).find((x) => x.id === id);
          if (!def || def.removida) return falha('meta');
          if (def.origem === 'criada') { d.criadas = d.criadas.filter((c) => c.id !== id); delete d.informes[id]; }
          else d.sobre[id] = Object.assign({}, d.sobre[id], { removida: true, removidaPor: quem, removidaEm: agora() });
          return { id, titulo: def.titulo };
        }, 'removida');
      },
      // Do arquivo: volta ao padrão de fábrica (sem as sobreposições).
      restaurar(id) {
        return mudar((d) => {
          if (!fabrica().some((f) => f.id === id) || !d.sobre[id]) return falha('meta');
          delete d.sobre[id];
          return { id };
        }, 'restaurada');
      },
      // Informe da pasta (só meta informada): { progressoPct 0 a 100, nota }.
      informar(id, informe = {}, quem = '') {
        const pct = Number(informe.progressoPct);
        if (informe.progressoPct === '' || informe.progressoPct == null || !Number.isFinite(pct) || pct < 0 || pct > 100) return falha('progresso');
        if (!texto(informe.nota)) return falha('nota');
        return mudar((d) => {
          const def = definicoes(d).find((x) => x.id === id);
          if (!def || def.removida) return falha('meta');
          if (def.vinculo && def.vinculo.tipo !== 'informada') return falha('calculada');
          d.informes[id] = d.informes[id] || [];
          const inf = { progressoPct: Math.round(pct), nota: texto(informe.nota), em: agora(), quem };
          d.informes[id].push(inf);
          return { id, informe: inf };
        }, 'informada');
      },

      // Reescreve GC.data.secretarias[área].metas, no lugar, com os números calculados (decisão 4).
      alinhar() {
        const secs = (GC.data && GC.data.secretarias) || {};
        fabrica();
        const todas = api.lista();
        Object.keys(secs).forEach((area) => {
          const arr = secs[area].metas;
          if (!Array.isArray(arr)) return;
          const novas = todas.filter((m) => m.area === area).map((m) => ({
            id: m.id, titulo: m.titulo, progressoPct: m.progressoPct, prazo: m.prazo, status: m.status,
            esperadoPct: m.esperadoPct, fonte: m.fonte ? m.fonte.tipo : 'informada', calculada: true,
          }));
          arr.length = 0;
          novas.forEach((m) => arr.push(m));
        });
        return todas.length;
      },
      recarregar() { if (GC.metasGoverno === api) api.alinhar(); emitir('recarga', {}); },
      assinar(fn) { ouvintes.add(fn); return () => ouvintes.delete(fn); },
    };
    return api;
  };

  // CSV das metas do plano de governo (tela #/metas).
  GC.csvMetasGoverno = function (lista) {
    const nomeArea = (id) => ((GC.data.areas || []).find((a) => a.id === id) || { nome: id }).nome;
    const campo = GC.campoCsv || ((v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`);
    const linhas = [['Secretaria', 'Compromisso', 'Progresso (%)', 'Esperado hoje (%)', 'Prazo', 'Situação', 'De onde vem o número'],
      ...lista.map((m) => [nomeArea(m.area), m.titulo, m.progressoPct, m.esperadoPct, m.prazo, GC.STATUS_META_GOVERNO[m.status], m.fonte ? m.fonte.texto : ''])];
    return `﻿${linhas.map((l) => l.map(campo).join(';')).join('\r\n')}\r\n`;
  };

  if (typeof window !== 'undefined' && window.localStorage) {
    const chave = `gc.metasGoverno.${GC.cidade ? GC.cidade.id : 'media'}`;
    GC.CHAVE_METAS_GOVERNO = chave;
    GC.metasGoverno = GC.criarMetasGoverno({
      chave,
      armazenamento: {
        ler(k) { try { return JSON.parse(window.localStorage.getItem(k)); } catch (e) { return null; } },
        gravar(k, v) { try { window.localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* sem armazenamento */ } },
      },
    });
  } else GC.metasGoverno = GC.criarMetasGoverno();
  // Ao carregar (depois de js/indicadores.js e da agenda de entregas): os arrays das secretarias já com o calculado.
  if (GC.data && GC.data.secretarias) GC.metasGoverno.alinhar();
})(window.GC = window.GC || {});
