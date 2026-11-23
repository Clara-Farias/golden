(function (GC) {
  // Modelos de gabinete de crise: o que já vem pronto quando um gabinete abre (as tarefas de cada
  // secretaria, as questões que a sala precisa responder e a orientação do comunicado), por tipo de
  // ocorrência. Os modelos abaixo são o padrão de fábrica e não mudam: o registro guarda só o que o
  // gestor mudou (sobreposições), os modelos criados e os de fábrica removidos, em localStorage
  // (gc.modelosCrise.<cidade>). O gabinete copia o modelo na hora em que abre: mudar o modelo depois
  // não mexe nas salas abertas. Tela em js/tela-modelos-crise.js; quem muda: GC.pode('crise.modelos').
  //
  // tarefa: { area, texto, prazoMin, sempre }. sempre = a secretaria é chamada em toda crise do modelo;
  // sem ele, a tarefa só entra quando a pasta já está na ocorrência. {b} = bairro, {l} = local.
  // grupo: o que a sala mostra a mais (chuva → gráfico da chuva prevista). Vem do modelo de origem.
  // painel: como o painel fica durante a crise (js/modo-crise.js): as camadas do mapa (nomes de CAMADAS em
  // js/app/camadas.js) e os widgets a mais na vista "Sala de crise". Modelo criado usa o do grupo (GC.painelDoModelo).
  const T = (area, texto, prazoMin, sempre = true) => ({ area, texto, prazoMin, sempre });
  const FABRICA = [
    {
      id: 'chuva', nome: 'Chuva e alagamento', emoji: '🌧', grupo: 'chuva', ordem: 10,
      tipos: ['alagamento', 'queda de árvore', 'bueiro'],
      painel: { camadas: ['risco', 'obras', 'transito'], widgets: ['risco', 'obras'] },
      tarefas: [
        T('defesa_civil', 'Vistoriar {l} e avisar as famílias da área de risco', 60),
        T('mobilidade', 'Interditar as vias alagadas e desviar as linhas de ônibus em {b}', 45),
        T('limpeza', 'Desobstruir bueiros e galerias em {b}', 90),
        T('saude', 'Deixar a UBS de {b} em plantão reforçado', 120),
        T('infraestrutura', 'Enviar equipe de drenagem para {l}', 90, false),
        T('educacao', 'Avaliar suspensão das aulas e liberar escola de {b} como abrigo', 120, false),
        T('seguranca', 'Apoiar a interdição e o isolamento da área em {b}', 60, false),
      ],
      perguntas: [
        'Há feridos ou desaparecidos?',
        'Quantas famílias precisam de abrigo agora?',
        'Os abrigos estão abertos e com vaga?',
        'Alguma via usada por ambulância está bloqueada?',
      ],
      orientacao: 'Evite as áreas alagadas, não atravesse ruas com correnteza e, se morar em área de risco, siga para o abrigo indicado pela Defesa Civil.',
      orientacaoCurta: 'Evite areas alagadas; se morar em area de risco, va ao abrigo.',
    },
    {
      id: 'deslizamento', nome: 'Deslizamento de encosta', emoji: '⛰', grupo: 'chuva', ordem: 20,
      tipos: ['deslizamento'],
      painel: { camadas: ['risco', 'habitacao'], widgets: ['risco'] },
      tarefas: [
        T('defesa_civil', 'Acionar a sirene e levar as famílias de {l} ao abrigo', 30),
        T('mobilidade', 'Interditar as ruas abaixo da encosta em {b}', 45),
        T('limpeza', 'Limpar as canaletas de drenagem da encosta em {b}', 90),
        T('saude', 'Deixar a UBS de {b} em plantão reforçado', 120),
        T('infraestrutura', 'Enviar equipe de drenagem para {l}', 90, false),
        T('educacao', 'Avaliar suspensão das aulas e liberar escola de {b} como abrigo', 120, false),
        T('seguranca', 'Apoiar a interdição e o isolamento da área em {b}', 60, false),
      ],
      perguntas: [
        'Há feridos ou desaparecidos?',
        'Todas as famílias da encosta já saíram?',
        'Há casas atingidas ou com rachaduras novas?',
        'Os abrigos estão abertos e com vaga?',
      ],
      orientacao: 'Se morar em encosta ou área de risco, saia de casa ao ouvir a sirene e siga para o abrigo indicado pela Defesa Civil. Rachadura nova, porta emperrada ou árvore inclinada: ligue 199.',
      orientacaoCurta: 'Ouviu a sirene? Saia de casa e va ao abrigo.',
    },
    {
      id: 'energia', nome: 'Falta de energia', emoji: '⚡', grupo: 'energia', ordem: 30,
      tipos: ['queda de energia', 'iluminação pública'],
      painel: { camadas: ['leitos', 'transito', 'predios'], widgets: ['leitos'] },
      tarefas: [
        T('infraestrutura', 'Cobrar da concessionária o prazo de religação em {b}', 30),
        T('saude', 'Confirmar geradores das unidades de saúde de {b}', 30),
        T('seguranca', 'Reforçar o patrulhamento noturno nas ruas sem luz de {b}', 60),
        T('mobilidade', 'Agentes de trânsito nos cruzamentos sem semáforo em {b}', 30),
        T('defesa_civil', 'Mapear pacientes que dependem de aparelhos elétricos em {b}', 90, false),
      ],
      perguntas: [
        'Qual a previsão de religação dada pela concessionária?',
        'Todas as unidades de saúde estão com gerador funcionando?',
        'Há pacientes em casa que dependem de aparelho elétrico?',
      ],
      orientacao: 'Desligue aparelhos da tomada até a luz voltar, redobre a atenção nos cruzamentos sem semáforo e, se depender de aparelho elétrico de saúde, ligue 156.',
      orientacaoCurta: 'Desligue aparelhos e redobre a atencao nos cruzamentos.',
    },
    {
      id: 'saude', nome: 'Saúde sob pressão', emoji: '🏥', grupo: 'saude', ordem: 40,
      tipos: ['lotação', 'falta de médico'],
      painel: { camadas: ['leitos', 'farmacias', 'vigilancia'], widgets: ['leitos', 'medicamentos'] },
      tarefas: [
        T('saude', 'Abrir leitos de retaguarda e acionar a regulação para {l}', 60),
        T('mobilidade', 'Garantir ambulâncias e rota livre até {l}', 45),
      ],
      perguntas: [
        'Quantos leitos de retaguarda estão livres?',
        'Qual o tempo de espera na emergência agora?',
        'Há pacientes esperando transferência?',
      ],
      orientacao: 'Procure primeiro a UBS mais próxima para casos sem urgência; em emergência ligue 192.',
      orientacaoCurta: 'Casos leves: procure a UBS. Urgencia: 192.',
    },
    {
      id: 'geral', nome: 'Outras crises', emoji: '🚨', grupo: 'geral', ordem: 90, padrao: true,
      tipos: [],
      tarefas: [],
      perguntas: [
        'Quem foi afetado e quantas pessoas?',
        'Qual a previsão de normalização?',
      ],
      orientacao: 'Acompanhe as atualizações da Prefeitura e evite a região até a normalização.',
      orientacaoCurta: 'Evite a regiao.',
    },
  ];
  GC.MODELOS_CRISE_FABRICA = FABRICA;
  // O painel da crise de um modelo: o dele, senão o de fábrica do mesmo grupo, senão nenhum extra.
  GC.painelDoModelo = function (m) {
    const p = (m && m.painel) || (m && (FABRICA.find((f) => f.grupo === m.grupo && f.painel) || {}).painel) || {};
    return { camadas: (p.camadas || []).slice(), widgets: (p.widgets || []).slice() };
  };
  // Pasta da ocorrência sem tarefa no modelo: recebe esta, para não ficar fora da sala.
  GC.TAREFA_PADRAO_CRISE = { texto: 'Plano de ação da pasta para {l} em {b}', prazoMin: 120 };
  GC.LIMITES_MODELO_CRISE = { tarefas: 15, perguntas: 10, texto: 160, orientacao: 400, orientacaoCurta: 90, nome: 60, prazoMin: 5, prazoMax: 24 * 60 };

  const copia = (x) => JSON.parse(JSON.stringify(x));
  const limpo = (t, max) => String(t == null ? '' : t).replace(/\s+/g, ' ').trim().slice(0, max);

  // Tipos de ocorrência que um modelo pode atender: os das regras de alerta e os das ocorrências.
  GC.tiposDeCrise = function () {
    const tipos = new Set(Object.keys((GC.data && GC.data.regras) || {}));
    ((GC.data && GC.data.ocorrencias) || []).forEach((o) => { if (o.tipo) tipos.add(o.tipo); });
    FABRICA.forEach((m) => m.tipos.forEach((t) => tipos.add(t)));
    return [...tipos].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  };

  // opcoes.armazenamento (opcional): { ler() → objeto | null, gravar(objeto) }. Sem ele, só memória.
  GC.criarModelosCrise = function (opcoes = {}) {
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

    const daFabrica = (id) => FABRICA.find((m) => m.id === id) || null;
    function montar(m, extra) {
      return Object.assign(copia(m), extra);
    }
    function lista() {
      const fab = FABRICA.filter((m) => !estado.removidos.includes(m.id))
        .map((m) => (estado.alterados[m.id]
          ? montar(Object.assign({}, m, estado.alterados[m.id], { id: m.id, grupo: m.grupo, padrao: m.padrao, ordem: m.ordem }), { fabrica: true, alterado: true })
          : montar(m, { fabrica: true, alterado: false })));
      const criados = estado.criados.map((m) => montar(m, { fabrica: false, alterado: false }));
      return [...fab, ...criados].sort((a, b) => (a.ordem || 0) - (b.ordem || 0) || a.nome.localeCompare(b.nome, 'pt-BR'));
    }
    const buscar = (id) => lista().find((m) => m.id === id) || null;
    // O modelo de um tipo de ocorrência; sem nenhum, o padrão (Outras crises).
    function doTipo(tipo) {
      const l = lista();
      return l.find((m) => (m.tipos || []).includes(tipo)) || l.find((m) => m.padrao) || l[0] || null;
    }

    // Confere e arruma os campos editáveis. Devolve { ok, motivo, dados }.
    function validar(d, id) {
      const L = GC.LIMITES_MODELO_CRISE;
      const nome = limpo(d.nome, L.nome);
      if (!nome) return { ok: false, motivo: 'nome' };
      if (lista().some((m) => m.id !== id && m.nome.toLowerCase() === nome.toLowerCase())) return { ok: false, motivo: 'nome_repetido' };
      const areas = new Set(((GC.data && GC.data.areas) || []).map((a) => a.id));
      const tarefas = (d.tarefas || []).map((t) => ({
        area: t.area, texto: limpo(t.texto, L.texto),
        prazoMin: Math.round(Number(t.prazoMin)), sempre: t.sempre !== false,
      })).filter((t) => t.texto);
      if (tarefas.length > L.tarefas) return { ok: false, motivo: 'tarefas_demais' };
      if (tarefas.some((t) => !areas.has(t.area))) return { ok: false, motivo: 'area' };
      if (tarefas.some((t) => !(t.prazoMin >= L.prazoMin && t.prazoMin <= L.prazoMax))) return { ok: false, motivo: 'prazo' };
      const perguntas = [...new Set((d.perguntas || []).map((p) => limpo(p, L.texto)).filter(Boolean))];
      if (perguntas.length > L.perguntas) return { ok: false, motivo: 'perguntas_demais' };
      const tipos = [...new Set((d.tipos || []).map((t) => String(t)).filter(Boolean))];
      return {
        ok: true,
        dados: {
          nome, emoji: limpo(d.emoji, 4) || '🚨', tipos, tarefas, perguntas,
          descricao: limpo(d.descricao, 200),
          orientacao: limpo(d.orientacao, L.orientacao),
          orientacaoCurta: limpo(d.orientacaoCurta, L.orientacaoCurta),
        },
      };
    }

    // Um tipo atende a um modelo só: ao pôr o tipo neste, ele sai dos outros.
    function tirarTiposDosOutros(id, tipos) {
      lista().filter((m) => m.id !== id && (m.tipos || []).some((t) => tipos.includes(t))).forEach((m) => {
        const resto = m.tipos.filter((t) => !tipos.includes(t));
        if (m.fabrica) estado.alterados[m.id] = Object.assign(campos(m), estado.alterados[m.id] || {}, { tipos: resto });
        else Object.assign(estado.criados.find((x) => x.id === m.id), { tipos: resto });
      });
    }
    const campos = (m) => ({ nome: m.nome, emoji: m.emoji, descricao: m.descricao || '', tipos: m.tipos.slice(), tarefas: copia(m.tarefas), perguntas: m.perguntas.slice(), orientacao: m.orientacao, orientacaoCurta: m.orientacaoCurta });

    function salvar(id, d) {
      const m = buscar(id);
      if (!m) return { ok: false, motivo: 'nao_existe' };
      const v = validar(d, id);
      if (!v.ok) return v;
      tirarTiposDosOutros(id, v.dados.tipos);
      if (m.fabrica) estado.alterados[id] = v.dados;
      else Object.assign(estado.criados.find((x) => x.id === id), v.dados);
      gravar();
      return { ok: true, modelo: buscar(id) };
    }

    // Novo modelo a partir de outro (duplicar): herda o grupo (o que a sala mostra a mais).
    function criar(baseId, d) {
      const base = buscar(baseId) || buscar('geral');
      const v = validar(Object.assign(base ? campos(base) : {}, d || {}), null);
      if (!v.ok) return v;
      tirarTiposDosOutros(null, v.dados.tipos);
      const novo = Object.assign({ id: `m-${++estado.seq}`, grupo: base ? base.grupo : 'geral', ordem: 80, criadoEm: GC.agora ? GC.agora() : Date.now(), base: base ? base.id : null }, v.dados);
      estado.criados.push(novo);
      gravar();
      return { ok: true, modelo: buscar(novo.id) };
    }

    // O padrão (Outras crises) não sai: é o que vale para tipo sem modelo.
    function excluir(id) {
      const m = buscar(id);
      if (!m) return { ok: false, motivo: 'nao_existe' };
      if (m.padrao) return { ok: false, motivo: 'padrao' };
      if (m.fabrica) { estado.removidos.push(id); delete estado.alterados[id]; } else estado.criados = estado.criados.filter((x) => x.id !== id);
      gravar();
      return { ok: true, modelo: m };
    }

    // Volta o modelo de fábrica ao original (desfaz edição ou remoção).
    function restaurar(id) {
      if (!daFabrica(id) || (!estado.alterados[id] && !estado.removidos.includes(id))) return { ok: false, motivo: 'nada' };
      delete estado.alterados[id];
      estado.removidos = estado.removidos.filter((x) => x !== id);
      tirarTiposDosOutros(id, daFabrica(id).tipos);
      gravar();
      return { ok: true, modelo: buscar(id) };
    }

    const removidos = () => FABRICA.filter((m) => estado.removidos.includes(m.id)).map((m) => copia(m));

    return { lista, buscar, doTipo, salvar, criar, excluir, restaurar, removidos, validar, recarregar: ler };
  };

  // Instância do navegador, por cidade. Sem localStorage (testes), só memória.
  const local = typeof window !== 'undefined' && window.localStorage ? window.localStorage : null;
  GC.CHAVE_MODELOS_CRISE = `gc.modelosCrise.${GC.cidade ? GC.cidade.id : 'media'}`;
  GC.modelosCrise = GC.criarModelosCrise(local ? {
    armazenamento: {
      ler() { try { return JSON.parse(local.getItem(GC.CHAVE_MODELOS_CRISE)); } catch (e) { return null; } },
      gravar(o) { try { local.setItem(GC.CHAVE_MODELOS_CRISE, JSON.stringify(o)); } catch (e) { /* sem armazenamento */ } },
    },
  } : {});
})(window.GC = window.GC || {});
