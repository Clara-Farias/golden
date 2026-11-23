(function (GC) {
  // Calendário sazonal: as épocas do ano que pedem algo da prefeitura (chuvas, dengue, volta às aulas…), o que
  // preparar antes de cada uma e se as metas dessa preparação estão em dia.
  // Spec: docs/specs/2026-11-12-vila-dourada-calendario-sazonal-design.md.
  // Uma fonte por número: temporada com série tem meses e pico CALCULADOS da mesma série que a tela da secretaria
  // mostra; época sem série na base é um marco escrito à mão, só com os meses (sem intensidade inventada).
  // Roda depois de data-secretarias.js (lê as séries já ajustadas à cidade). Puro: sem DOM, testável em Node.
  const NOMES_MES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const LIMIAR = 0.4; // intensidade mínima para um mês contar como parte da temporada
  const mesDe = (curto) => CURTOS.indexOf(curto);

  // Escrito à mão: o que cada época pede. serie = caminho dentro de GC.data; ruim = qual ponta da série é a ruim.
  // marco = { de, ate } em meses curtos (época sem série na base). acoes[].meta = meta do plano (secretarias[area].metas).
  const temporadas = [
    {
      id: 'chuvas', nome: 'Chuvas de verão', area: 'defesa_civil', icone: 'cloud-rain', camada: 'risco',
      serie: 'secretarias.defesa_civil.serie', ruim: 'alto', preparo: 3,
      porque: 'alagamentos e deslizamentos nas áreas de risco',
      cidadao: 'Não jogue lixo na rua: ele entope os bueiros. Com chuva forte, não atravesse ruas alagadas e, se mora em área de risco, siga os avisos da Defesa Civil (199).',
      acoes: [
        { texto: 'Limpar as galerias e os bueiros', meta: { area: 'defesa_civil', titulo: 'Limpar 100% das galerias antes das chuvas' } },
        { texto: 'Sirene e SMS em todas as áreas de risco', meta: { area: 'defesa_civil', titulo: 'Sirenes em todas as áreas de risco' } },
        { texto: 'Plano de contingência revisado', meta: { area: 'defesa_civil', titulo: 'Plano de contingência atualizado' } },
      ],
    },
    {
      id: 'internacoes', nome: 'Pico de internações', area: 'saude', icone: 'bed', camada: 'leitos',
      serie: 'leitos.serie', ruim: 'alto', preparo: 2,
      porque: 'ocupação dos leitos da rede perto do limite',
      acoes: [{ texto: 'Abrir leitos de retaguarda e reforçar a escala dos plantões' }, { texto: 'Combinar com a regulação o remanejamento entre hospitais' }],
    },
    {
      id: 'dengue', nome: 'Dengue e arboviroses', area: 'saude', icone: 'bug', marco: { de: 'fev', ate: 'mai' }, preparo: 3,
      porque: 'casos sobem com o calor e a água parada depois das chuvas',
      cidadao: 'Uma vez por semana, tire a água parada de vasos, pneus, calhas e caixas-d’água destampadas. Febre alta e dor no corpo: procure a UBS.',
      acoes: [{ texto: 'Mutirão contra o mosquito nos bairros com foco' }, { texto: 'Reforçar o estoque de soro e paracetamol nas UBS' }],
    },
    {
      id: 'volta-aulas', nome: 'Volta às aulas', area: 'educacao', icone: 'school', camada: 'escolas', marco: { de: 'fev', ate: 'fev' }, preparo: 2,
      porque: 'escolas cheias de novo e transporte escolar rodando',
      cidadao: 'Confira a matrícula e o transporte escolar com a escola antes do início das aulas.',
      acoes: [{ texto: 'Manutenção das escolas (telhado, água, energia)' }, { texto: 'Rotas do transporte escolar conferidas' }, { texto: 'Vagas de creche', meta: { area: 'educacao', titulo: 'Abrir 300 vagas de creche' } }],
    },
    {
      id: 'gripe', nome: 'Campanha da gripe', area: 'saude', icone: 'vaccine', marco: { de: 'abr', ate: 'mai' }, preparo: 2,
      porque: 'vacinação de idosos, crianças e gestantes antes do frio',
      cidadao: 'Idosos, crianças e gestantes: a vacina é gratuita nas UBS.',
      acoes: [{ texto: 'Pedir as doses e montar as salas de vacinação' }, { texto: 'Divulgar o calendário por bairro' }],
    },
    {
      id: 'estiagem', nome: 'Estiagem e queimadas', area: 'defesa_civil', icone: 'flame', marco: { de: 'jul', ate: 'set' }, preparo: 2,
      porque: 'tempo seco, focos de queimada e ar pior',
      cidadao: 'Não queime lixo nem mato. Viu fogo? Ligue 193. Beba água e evite exercício nas horas mais secas.',
      acoes: [{ texto: 'Aceiros nas áreas verdes e brigada de prontidão' }, { texto: 'Avisar sobre queimada de lixo e terrenos' }],
    },
    {
      id: 'fim-de-ano', nome: 'Movimento de fim de ano', area: 'seguranca', icone: 'confetti', marco: { de: 'dez', ate: 'dez' }, preparo: 1,
      porque: 'comércio cheio, trânsito e festas no Centro',
      cidadao: 'Centro cheio: prefira o ônibus. Dúvidas sobre linhas e horários: {tel}.',
      acoes: [{ texto: 'Reforço da Guarda nas ruas de comércio' }, { texto: 'Plano de trânsito e de linhas de ônibus no Centro' }],
    },
  ];

  GC.data.sazonal = { temporadas };

  // ---- cálculos ----
  const lerSerie = (caminho) => caminho.split('.').reduce((o, k) => (o ? o[k] : undefined), GC.data);
  const mesCenario = () => (GC.relogio && Number.isInteger(GC.relogio.mesCenario) ? GC.relogio.mesCenario : new Date().getMonth());
  // A série de 12 meses fecha no mês anterior ao do cenário: o ponto i é o mês (cenário + i) % 12.
  const mesDoPonto = (i, base) => (base + i) % 12;
  const corrida = (de, ate) => { const l = [de]; while (l[l.length - 1] !== ate) l.push((l[l.length - 1] + 1) % 12); return l; };

  // Intensidade (0 a 1) de cada mês do ano, a partir da série: o pior valor = 1, o melhor = 0.
  function intensidadePorMes(valores, ruim, base) {
    const min = Math.min(...valores); const max = Math.max(...valores);
    const porMes = new Array(12).fill(0);
    valores.slice(-12).forEach((v, i) => {
      const t = max === min ? 0 : (v - min) / (max - min);
      porMes[mesDoPonto(i, base)] = +(ruim === 'baixo' ? 1 - t : t).toFixed(2);
    });
    return porMes;
  }

  // Meses seguidos em volta do pico com intensidade >= LIMIAR (a temporada não fura no meio).
  function corridaEmVolta(intensidade, pico) {
    let de = pico; let ate = pico;
    for (let k = 1; k < 12 && intensidade[(de + 11) % 12] >= LIMIAR; k++) de = (de + 11) % 12;
    for (let k = 1; k < 12 && intensidade[(ate + 1) % 12] >= LIMIAR && (ate + 1) % 12 !== de; k++) ate = (ate + 1) % 12;
    return corrida(de, ate);
  }

  function metaDe(m) {
    const s = (GC.data.secretarias || {})[m.area];
    return s && (s.metas || []).find((x) => x.titulo === m.titulo);
  }

  // Temporada pronta para mostrar, vista do mês `mes`.
  function montar(t, mes, base) {
    let meses; let pico = null; let intensidade = null; let fonte = null;
    if (t.serie) {
      const s = lerSerie(t.serie);
      if (!s || !Array.isArray(s.meses) || s.meses.length < 12) return null;
      intensidade = intensidadePorMes(s.meses, t.ruim, base);
      pico = intensidade.indexOf(1);
      meses = corridaEmVolta(intensidade, pico);
      const ultimos = s.meses.slice(-12);
      const valoresPorMes = new Array(12).fill(null);
      ultimos.forEach((v, i) => { valoresPorMes[mesDoPonto(i, base)] = v; });
      fonte = { rotulo: s.rotulo, unidade: s.unidade, valorPico: valoresPorMes[pico], valoresPorMes };
    } else {
      meses = corrida(mesDe(t.marco.de), mesDe(t.marco.ate));
    }
    const inicio = meses[0];
    const fim = meses[meses.length - 1];
    const preparoMeses = Array.from({ length: t.preparo }, (_, k) => (inicio - t.preparo + k + 12) % 12).filter((m) => !meses.includes(m));
    const situacao = mes === pico ? 'pico' : meses.includes(mes) ? 'temporada' : preparoMeses.includes(mes) ? 'preparo' : 'fora';
    const comecou = situacao === 'pico' || situacao === 'temporada';
    const acoes = t.acoes.map((a) => {
      const m = a.meta && metaDe(a.meta);
      if (!m) return { texto: a.texto };
      const concluida = m.status === 'concluida' || m.progressoPct >= 100;
      return { texto: a.texto, meta: { titulo: m.titulo, progressoPct: m.progressoPct, prazo: m.prazo, status: m.status, concluida, atrasada: comecou && !concluida } };
    });
    return {
      id: t.id, nome: t.nome, area: t.area, icone: t.icone, camada: t.camada || null, porque: t.porque, cidadao: t.cidadao || null,
      origem: t.serie ? 'serie' : 'marco', fonte, intensidade,
      meses, inicio, fim, pico, preparo: preparoMeses, situacao,
      faltamMeses: (inicio - mes + 12) % 12, // até o começo (0 = já começou ou começa agora)
      acoes, metasAtrasadas: acoes.filter((a) => a.meta && a.meta.atrasada),
    };
  }

  // As temporadas de agora: as do registro (js/sazonal-registro.js: o que o gestor mudou), senão as de fábrica.
  const definicoes = () => (GC.registroSazonal ? GC.registroSazonal.temporadas() : temporadas);

  function lista(mes = mesCenario()) {
    const base = mesCenario();
    return definicoes().map((t) => montar(t, mes, base)).filter(Boolean);
  }

  // Prévia de uma temporada ainda não salva (editor da configuração): a mesma conta do calendário.
  const previa = (t, mes = mesCenario()) => {
    if (!t.serie && !(t.marco && mesDe(t.marco.de) >= 0 && mesDe(t.marco.ate) >= 0)) return null; // corrida() não para sem os dois meses
    try { return montar(Object.assign({ acoes: [] }, t), mes, mesCenario()); } catch (e) { return null; }
  };

  // O mês visto pela prefeitura: o que está no pico, em curso, em preparo, o que vem depois e as metas atrasadas.
  function agora(mes = mesCenario()) {
    const todas = lista(mes);
    const emCurso = todas.filter((t) => t.situacao === 'pico' || t.situacao === 'temporada');
    const emPreparo = todas.filter((t) => t.situacao === 'preparo').sort((a, b) => a.faltamMeses - b.faltamMeses);
    const proximas = todas.filter((t) => t.situacao === 'fora' && t.faltamMeses >= 1 && t.faltamMeses <= 4).sort((a, b) => a.faltamMeses - b.faltamMeses);
    return {
      mes, nomeMes: NOMES_MES[mes], todas,
      emPico: emCurso.filter((t) => t.situacao === 'pico'), emCurso, emPreparo, proximas,
      atrasadas: todas.flatMap((t) => t.metasAtrasadas.map((a) => Object.assign({ temporada: t.nome, temporadaId: t.id }, a))),
    };
  }

  // "set a mar", "fev", "abr a mai".
  const periodo = (t) => (t.inicio === t.fim ? CURTOS[t.inicio] : `${CURTOS[t.inicio]} a ${CURTOS[t.fim]}`);

  // "Fique atento neste mês" do Portal do Cidadão: o que está em curso e o que está chegando, só com a dica ao
  // morador (sem metas nem ações internas). {tel} vira o telefone da Prefeitura (GC.telefonePrefeitura).
  function paraCidadao(mes = mesCenario()) {
    const s = agora(mes);
    const tel = GC.telefonePrefeitura ? GC.telefonePrefeitura() : '156';
    return [...s.emCurso, ...s.emPreparo].filter((t) => t.cidadao).map((t) => ({
      id: t.id, nome: t.nome, icone: t.icone,
      quando: t.situacao === 'preparo' ? `a partir de ${NOMES_MES[t.inicio]}` : `até ${NOMES_MES[t.fim]}`,
      agora: t.situacao !== 'preparo',
      dica: t.cidadao.replace('{tel}', tel),
    }));
  }

  GC.sazonal = { temporadas: lista, previa, agora, paraCidadao, periodo, mesCenario, NOMES_MES, CURTOS, LIMIAR };
})(window.GC = window.GC || {});
