(function (GC) {
  // Registro do calendário sazonal: o que o gestor mudou nas temporadas de js/data-sazonal.js. As temporadas de lá
  // são o padrão de fábrica e não mudam: o registro guarda só as sobreposições, as temporadas criadas e as de
  // fábrica removidas, em localStorage (gc.sazonal.<cidade>). O motor (GC.sazonal) lê GC.registroSazonal.temporadas()
  // na hora da chamada, então tela, widget, Maia, telão e portal recebem a mesma lista.
  // Carregado logo depois de js/data-sazonal.js (index.html, cidadao.html, embed.html). Tela em
  // js/tela-sazonal-config.js; quem muda: GC.pode('sazonal.editar') (gestor geral), pelas ações de js/app/telas.js.
  //
  // Temporada: { id, nome, area, icone, camada, preparo, porque, cidadao, acoes: [{ texto, meta?: { area, titulo } }] }
  // e um dos dois jeitos de dizer quando acontece: serie + ruim (meses e pico calculados da série) ou
  // marco: { de, ate } (data conhecida, sem intensidade).
  const CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  GC.LIMITES_SAZONAL = { nome: 50, porque: 140, cidadao: 300, acoes: 6, texto: 120, preparoMax: 6 };

  // Ícones que a temporada pode usar (Tabler). O de uma temporada de fábrica fora da lista continua valendo.
  GC.ICONES_SAZONAL = ['cloud-rain', 'cloud-storm', 'sun', 'temperature', 'snowflake', 'wind', 'droplet', 'flame', 'bug', 'virus',
    'vaccine', 'bed', 'first-aid-kit', 'school', 'backpack', 'confetti', 'music', 'ball-football', 'shopping-cart', 'car',
    'bus', 'tree', 'leaf', 'trash', 'building-community', 'calendar-event'];

  // Camadas do mapa que "Ver no mapa" pode ligar (nomes de CAMADAS em js/app/camadas.js).
  GC.CAMADAS_SAZONAL = [
    ['risco', 'Áreas de risco'], ['leitos', 'Leitos'], ['escolas', 'Escolas'], ['obras', 'Obras'], ['frota', 'Frota'],
    ['coleta', 'Coleta de lixo'], ['farmacias', 'Farmácias'], ['vigilancia', 'Vigilância em saúde'], ['transito', 'Trânsito'],
    ['habitacao', 'Habitação'], ['predios', 'Prédios públicos'], ['economia', 'Economia local'], ['eventos', 'Grandes eventos'],
  ];

  const copia = (x) => JSON.parse(JSON.stringify(x));
  const limpo = (t, max) => String(t == null ? '' : t).replace(/\s+/g, ' ').trim().slice(0, max);
  const lerCaminho = (caminho) => String(caminho || '').split('.').reduce((o, k) => (o ? o[k] : undefined), GC.data);
  const nomeArea = (id) => ((GC.data.areas || []).find((a) => a.id === id) || { nome: id }).nome;

  // Séries mensais que uma temporada pode usar: a de cada secretaria e a dos leitos (as mesmas das telas).
  GC.seriesSazonal = function () {
    const lista = [];
    Object.keys(GC.data.secretarias || {}).forEach((area) => {
      const s = GC.data.secretarias[area].serie;
      if (s && Array.isArray(s.meses) && s.meses.length >= 12) lista.push({ caminho: `secretarias.${area}.serie`, rotulo: `${s.rotulo} (${nomeArea(area)})`, unidade: s.unidade });
    });
    const l = GC.data.leitos && GC.data.leitos.serie;
    if (l && Array.isArray(l.meses) && l.meses.length >= 12) lista.push({ caminho: 'leitos.serie', rotulo: `${l.rotulo} (Saúde)`, unidade: l.unidade });
    return lista;
  };

  // Metas do plano de governo que uma ação pode acompanhar, por secretaria.
  GC.metasParaSazonal = function () {
    return Object.keys(GC.data.secretarias || {}).map((area) => ({
      area, nome: nomeArea(area), metas: (GC.data.secretarias[area].metas || []).map((m) => m.titulo),
    })).filter((g) => g.metas.length);
  };

  // opcoes: { fabrica: [temporadas], armazenamento?: { ler() → objeto | null, gravar(objeto) } }. Sem armazenamento, só memória.
  GC.criarRegistroSazonal = function (opcoes = {}) {
    const FABRICA = opcoes.fabrica || [];
    const arm = opcoes.armazenamento || null;
    const vazio = () => ({ versao: 1, seq: 0, alterados: {}, criados: [], removidos: [] });
    let estado = vazio();

    // Nada salvo (ou o "Desfazer" apagou a chave): volta ao de fábrica.
    function ler() {
      if (!arm) return;
      try {
        const s = arm.ler();
        if (!s) estado = vazio();
        else if (s.versao === 1) {
          estado = {
            versao: 1, seq: Number(s.seq) || 0,
            alterados: s.alterados && typeof s.alterados === 'object' ? s.alterados : {},
            criados: Array.isArray(s.criados) ? s.criados : [],
            removidos: Array.isArray(s.removidos) ? s.removidos : [],
          };
        }
      } catch (e) { /* salvo corrompido: fica o de fábrica */ }
    }
    function gravar() {
      if (!arm) return;
      try { arm.gravar(estado); } catch (e) { /* sem espaço ou bloqueado: segue em memória */ }
    }
    ler();

    const daFabrica = (id) => FABRICA.find((t) => t.id === id) || null;
    // A sobreposição troca o jeito de dizer quando acontece inteiro (série ou data conhecida).
    function sobrepor(t, alt) {
      const base = Object.assign({}, t);
      if (alt.marco) { delete base.serie; delete base.ruim; }
      if (alt.serie) delete base.marco;
      return Object.assign(base, alt, { id: t.id });
    }
    function lista() {
      const fab = FABRICA.filter((t) => !estado.removidos.includes(t.id)).map((t) => (estado.alterados[t.id]
        ? Object.assign(copia(sobrepor(t, estado.alterados[t.id])), { fabrica: true, alterado: true })
        : Object.assign(copia(t), { fabrica: true, alterado: false })));
      const criados = estado.criados.map((t) => Object.assign(copia(t), { fabrica: false, alterado: false }));
      return [...fab, ...criados];
    }
    // O que o motor lê: a lista sem as marcas do registro.
    const temporadas = () => lista().map(({ fabrica, alterado, ...t }) => t);
    const buscar = (id) => lista().find((t) => t.id === id) || null;

    // Confere e arruma os campos editáveis. Devolve { ok, motivo, dados }.
    function validar(d, id) {
      const L = GC.LIMITES_SAZONAL;
      const nome = limpo(d.nome, L.nome);
      if (!nome) return { ok: false, motivo: 'nome' };
      if (lista().some((t) => t.id !== id && t.nome.toLowerCase() === nome.toLowerCase())) return { ok: false, motivo: 'nome_repetido' };
      if (!(GC.data.areas || []).some((a) => a.id === d.area)) return { ok: false, motivo: 'area' };
      const quando = {};
      if (d.serie) {
        const s = lerCaminho(d.serie);
        if (!s || !Array.isArray(s.meses) || s.meses.length < 12) return { ok: false, motivo: 'serie' };
        quando.serie = d.serie;
        quando.ruim = d.ruim === 'baixo' ? 'baixo' : 'alto';
      } else {
        const m = d.marco || {};
        if (!CURTOS.includes(m.de) || !CURTOS.includes(m.ate)) return { ok: false, motivo: 'meses' };
        quando.marco = { de: m.de, ate: m.ate };
      }
      const preparo = Math.round(Number(d.preparo));
      if (!(preparo >= 0 && preparo <= L.preparoMax)) return { ok: false, motivo: 'preparo' };
      const porque = limpo(d.porque, L.porque).replace(/\.$/, '');
      if (!porque) return { ok: false, motivo: 'porque' };
      const metas = GC.metasParaSazonal();
      const acoes = (d.acoes || []).map((a) => {
        const texto = limpo(a.texto, L.texto);
        const meta = a.meta && a.meta.area && a.meta.titulo ? { area: a.meta.area, titulo: a.meta.titulo } : null;
        return meta ? { texto, meta } : { texto };
      }).filter((a) => a.texto);
      if (!acoes.length) return { ok: false, motivo: 'acoes' };
      if (acoes.length > L.acoes) return { ok: false, motivo: 'acoes_demais' };
      if (acoes.some((a) => a.meta && !metas.some((g) => g.area === a.meta.area && g.metas.includes(a.meta.titulo)))) return { ok: false, motivo: 'meta' };
      const camada = GC.CAMADAS_SAZONAL.some(([c]) => c === d.camada) ? d.camada : null;
      const icone = /^[a-z0-9-]{2,40}$/.test(d.icone || '') ? d.icone : 'calendar-event';
      return {
        ok: true,
        dados: Object.assign({ nome, area: d.area, icone, camada, preparo, porque, cidadao: limpo(d.cidadao, L.cidadao) || null, acoes }, quando),
      };
    }

    const campos = (t) => {
      const { fabrica, alterado, id, criadaEm, base, ...resto } = copia(t);
      return resto;
    };

    function salvar(id, d) {
      const t = buscar(id);
      if (!t) return { ok: false, motivo: 'nao_existe' };
      const v = validar(d, id);
      if (!v.ok) return v;
      if (t.fabrica) estado.alterados[id] = v.dados;
      else {
        const i = estado.criados.findIndex((x) => x.id === id);
        estado.criados[i] = Object.assign({ id, criadaEm: estado.criados[i].criadaEm, base: estado.criados[i].base }, v.dados);
      }
      gravar();
      return { ok: true, temporada: buscar(id) };
    }

    // Nova temporada, em branco ou a partir de outra (duplicar).
    function criar(baseId, d) {
      const base = baseId ? buscar(baseId) : null;
      const v = validar(Object.assign(base ? campos(base) : {}, d || {}), null);
      if (!v.ok) return v;
      const nova = Object.assign({ id: `t-${++estado.seq}`, criadaEm: GC.agora ? GC.agora() : Date.now(), base: base ? base.id : null }, v.dados);
      estado.criados.push(nova);
      gravar();
      return { ok: true, temporada: buscar(nova.id) };
    }

    // Sempre fica ao menos uma: o calendário vazio não diria nada.
    function excluir(id) {
      const t = buscar(id);
      if (!t) return { ok: false, motivo: 'nao_existe' };
      if (lista().length <= 1) return { ok: false, motivo: 'ultima' };
      if (t.fabrica) { estado.removidos.push(id); delete estado.alterados[id]; } else estado.criados = estado.criados.filter((x) => x.id !== id);
      gravar();
      return { ok: true, temporada: t };
    }

    // Volta a temporada de fábrica ao original (desfaz edição ou remoção).
    function restaurar(id) {
      if (!daFabrica(id) || (!estado.alterados[id] && !estado.removidos.includes(id))) return { ok: false, motivo: 'nada' };
      delete estado.alterados[id];
      estado.removidos = estado.removidos.filter((x) => x !== id);
      gravar();
      return { ok: true, temporada: buscar(id) };
    }

    const removidas = () => FABRICA.filter((t) => estado.removidos.includes(t.id)).map(copia);

    return { lista, temporadas, buscar, salvar, criar, excluir, restaurar, removidas, validar, recarregar: ler };
  };

  // Instância do navegador, por cidade. Sem localStorage (testes), só memória.
  const local = (() => { try { return typeof window !== 'undefined' && window.localStorage ? window.localStorage : null; } catch (e) { return null; } })();
  GC.CHAVE_SAZONAL = `gc.sazonal.${GC.cidade ? GC.cidade.id : 'media'}`;
  GC.registroSazonal = GC.criarRegistroSazonal(Object.assign({ fabrica: (GC.data.sazonal && GC.data.sazonal.temporadas) || [] }, local ? {
    armazenamento: {
      ler() { try { return JSON.parse(local.getItem(GC.CHAVE_SAZONAL)); } catch (e) { return null; } },
      gravar(o) { try { local.setItem(GC.CHAVE_SAZONAL, JSON.stringify(o)); } catch (e) { /* sem armazenamento */ } },
    },
  } : {}));
  // As outras abas (painel, portal, site) releem quando o gestor muda o calendário.
  if (local && typeof window.addEventListener === 'function') {
    window.addEventListener('storage', (e) => { if (e.key === GC.CHAVE_SAZONAL) GC.registroSazonal.recarregar(); });
  }
})(window.GC = window.GC || {});
