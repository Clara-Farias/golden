(function (GC) {
  // Manutenção de prédios públicos: chamados abertos (telhado, ar-condicionado, elétrica, hidráulica,
  // acessibilidade) e vistorias obrigatórias (AVCB dos bombeiros, laudo elétrico, para-raios, limpeza da caixa
  // d'água) de cada prédio da Prefeitura. Quem conserta é a Infraestrutura; a pasta que usa o prédio fica em
  // `pastaUsuaria`. Os prédios são os MESMOS das outras camadas: escolas (js/data-educacao.js), hospitais e UPAs
  // (js/data-leitos.js) e UBS (farmácias de js/data-medicamentos.js), lidos na hora da chamada; o paço, o CRAS e
  // o ginásio são escritos aqui. Coerente com o resto: a Escola Lagoa Azul é a que está sem água (oc-15) e a
  // Escola Alto da Serra tem goteira com a chuva prevista pela Defesa Civil.
  const data = (iso) => GC.relogio.data(iso);
  const DIA_MS = 86400000;
  const utc = (iso) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
  const diasEntre = (de, ate) => Math.round((utc(ate) - utc(de)) / DIA_MS);
  const somaDias = (iso, n) => new Date(utc(iso) + n * DIA_MS).toISOString().slice(0, 10);

  // Prazo para resolver o chamado, em dias, pela gravidade. Vistoria "a vencer": vence em até 30 dias.
  const PRAZO_DIAS = { alta: 5, media: 20, baixa: 45 };
  const A_VENCER_DIAS = 30;

  const TIPOS_CHAMADO = {
    telhado: 'Telhado e infiltração',
    ar: 'Ar-condicionado',
    eletrica: 'Elétrica',
    hidraulica: 'Hidráulica',
    acessibilidade: 'Acessibilidade',
  };
  const VISTORIAS = {
    avcb: 'AVCB dos bombeiros',
    eletrico: 'Laudo elétrico',
    spda: 'Para-raios',
    caixa_agua: "Limpeza da caixa d'água",
  };

  // Prédios administrativos (os outros vêm das camadas de escolas e de saúde).
  const administrativos = [
    { id: 'paco', nome: 'Paço Municipal', tipo: 'administrativo', bairroId: 'centro', desloc: [0.0015, -0.0015], pastaUsuaria: 'gabinete', pastaNome: 'Gabinete' },
    { id: 'cras-lagoa', nome: 'CRAS Lagoa Azul', tipo: 'cras', bairroId: 'lagoa_azul', desloc: [0.002, 0.002], pastaUsuaria: 'assistencia', pastaNome: 'Assistência Social' },
    { id: 'ginasio-vn', nome: 'Ginásio Municipal Vila Nova', tipo: 'ginasio', bairroId: 'vila_nova', desloc: [0.002, -0.002], pastaUsuaria: 'esporte', pastaNome: 'Esporte e Lazer' },
  ];

  // c(id, prédio, tipo, título, aberto em, gravidade)
  const c = (id, predioId, tipo, titulo, abertoEm, gravidade) => ({ id, predioId, tipo, titulo, abertoEm: data(abertoEm), gravidade });
  const chamados = [
    c('ch-01', 'emef-serra', 'telhado', 'Telhado vazando em 3 salas de aula', '2026-10-22', 'alta'),
    c('ch-02', 'emef-lagoa', 'hidraulica', "Bomba da caixa d'água queimada: escola sem água", '2026-11-03', 'alta'),
    c('ch-03', 'farmacia-centro', 'ar', 'Ar-condicionado parado na sala de vacinas e na recepção', '2026-10-27', 'alta'),
    c('ch-04', 'farmacia-porto_dourado', 'ar', 'Ar-condicionado de 2 consultórios sem gelar', '2026-10-15', 'media'),
    c('ch-05', 'hm', 'eletrica', 'Gerador de emergência falhou no teste mensal', '2026-10-30', 'media'),
    c('ch-06', 'upa-centro', 'acessibilidade', 'Rampa da entrada com piso solto', '2026-09-20', 'baixa'),
    c('ch-07', 'emef-vn', 'telhado', 'Infiltração no teto do refeitório', '2026-10-29', 'media'),
    c('ch-08', 'cmei-vila-nova', 'eletrica', 'Tomadas sem proteção nas salas das crianças', '2026-11-02', 'media'),
    c('ch-09', 'emef-centro', 'acessibilidade', 'Elevador parado: aluno cadeirante sem acesso ao 2º andar', '2026-10-08', 'media'),
    c('ch-10', 'paco', 'ar', 'Ar-condicionado do plenário fazendo barulho', '2026-10-19', 'baixa'),
    c('ch-11', 'cras-lagoa', 'telhado', 'Goteira na sala de atendimento', '2026-10-25', 'media'),
    c('ch-12', 'ginasio-vn', 'eletrica', 'Metade dos refletores da quadra queimados', '2026-10-12', 'media'),
    c('ch-13', 'farmacia-lagoa_azul', 'hidraulica', 'Vazamento na pia do banheiro', '2026-10-30', 'baixa'),
  ];

  // Vistorias fora do padrão (vencidas ou perto de vencer), por prédio. As outras vencem entre 45 e 400 dias.
  const excecoes = {
    hm: { avcb: data('2026-10-12') },
    'ginasio-vn': { avcb: data('2026-08-31') },
    'emef-lagoa': { caixa_agua: data('2026-10-20') },
    'emef-jardim': { eletrico: data('2026-10-28') },
    paco: { spda: data('2026-11-17') },
    'cmei-vila-nova': { eletrico: data('2026-11-25') },
    'emef-porto': { spda: data('2026-12-01') },
    'upa-porto': { avcb: data('2026-11-20') },
  };

  GC.data.predios = { administrativos, chamados, excecoes, prazoDias: PRAZO_DIAS, aVencerDias: A_VENCER_DIAS, tiposChamado: TIPOS_CHAMADO, vistorias: VISTORIAS };

  // ---- prédios (lidos das outras camadas na hora da chamada, com guarda) ----
  const nomeArea = (id) => ((GC.data.areas || []).find((a) => a.id === id) || { nome: id }).nome;
  function lista(d = GC.data.predios, bairros = GC.data.bairros) {
    const existe = new Set(bairros.map((b) => b.id));
    const out = [];
    const escolas = (GC.data.educacao && GC.data.educacao.escolas) || [];
    escolas.forEach((x) => out.push({ id: x.id, nome: x.nome, tipo: 'escola', bairroId: x.bairroId, lat: x.lat, lng: x.lng, camada: 'escolas', pastaUsuaria: 'educacao', pastaNome: nomeArea('educacao') }));
    const unidades = (GC.data.leitos && GC.data.leitos.unidades) || [];
    unidades.forEach((x) => out.push({ id: x.id, nome: x.nome, tipo: x.tipo, bairroId: x.bairroId, lat: x.lat, lng: x.lng, camada: 'leitos', pastaUsuaria: 'saude', pastaNome: nomeArea('saude') }));
    let ubs = [];
    try { ubs = GC.medicamentos ? GC.medicamentos.farmacias() : []; } catch (e) { ubs = []; }
    ubs.filter((x) => x.lat !== null).forEach((x) => out.push({ id: x.id, nome: x.nome, tipo: 'ubs', bairroId: x.bairroId, lat: x.lat, lng: x.lng, camada: 'farmacias', pastaUsuaria: 'saude', pastaNome: nomeArea('saude') }));
    d.administrativos.filter((x) => existe.has(x.bairroId)).forEach((x) => {
      const centro = bairros.find((b) => b.id === x.bairroId).centro;
      out.push({ id: x.id, nome: x.nome, tipo: x.tipo, bairroId: x.bairroId, lat: +(centro[0] + x.desloc[0]).toFixed(5), lng: +(centro[1] + x.desloc[1]).toFixed(5), camada: null, pastaUsuaria: x.pastaUsuaria, pastaNome: x.pastaNome });
    });
    return out.filter((p) => existe.has(p.bairroId) && typeof p.lat === 'number' && typeof p.lng === 'number');
  }

  // ---- cálculos ----
  const GRAV = { alta: 0, media: 1, baixa: 2 };
  const ORDEM = { critica: 0, atencao: 1, ok: 2 };

  function avaliar(p, i = 0, d = GC.data.predios, hoje = GC.relogio.hoje) {
    const chs = d.chamados.filter((x) => x.predioId === p.id).map((x) => {
      const dias = Math.max(0, diasEntre(x.abertoEm, hoje));
      const prazo = d.prazoDias[x.gravidade];
      return Object.assign({}, x, { tipoNome: d.tiposChamado[x.tipo], diasAberto: dias, prazoDias: prazo, atrasado: dias > prazo });
    }).sort((a, b) => GRAV[a.gravidade] - GRAV[b.gravidade] || b.diasAberto - a.diasAberto);
    const exc = d.excecoes[p.id] || {};
    const vis = Object.keys(d.vistorias).map((tipo, vi) => {
      // Sem exceção, vence entre 45 e 400 dias (sem aleatoriedade).
      const validade = exc[tipo] || somaDias(hoje, 45 + ((i * 37 + vi * 53) % 356));
      const faltam = diasEntre(hoje, validade);
      const situacao = faltam < 0 ? 'vencida' : faltam <= d.aVencerDias ? 'a_vencer' : 'ok';
      return { tipo, nome: d.vistorias[tipo], validade, faltamDias: faltam, situacao };
    });
    const vencidas = vis.filter((v) => v.situacao === 'vencida');
    const aVencer = vis.filter((v) => v.situacao === 'a_vencer');
    const graves = chs.filter((x) => x.gravidade === 'alta');
    const atrasados = chs.filter((x) => x.atrasado);
    const situacao = graves.length || vencidas.length ? 'critica'
      : chs.some((x) => x.gravidade === 'media' || x.atrasado) || aVencer.length ? 'atencao' : 'ok';
    // Motivo principal, em uma linha (popup, widget e Maia).
    const motivos = [
      ...graves.map((x) => ({ texto: x.titulo, critico: true })),
      ...vencidas.map((v) => ({ texto: `${v.nome} vencido há ${-v.faltamDias} ${-v.faltamDias === 1 ? 'dia' : 'dias'}`, critico: true })),
      ...chs.filter((x) => x.gravidade !== 'alta').map((x) => ({ texto: x.titulo, critico: false })),
      ...aVencer.map((v) => ({ texto: `${v.nome} vence em ${v.faltamDias} ${v.faltamDias === 1 ? 'dia' : 'dias'}`, critico: false })),
    ];
    return Object.assign({}, p, { area: 'infraestrutura', chamados: chs, vistorias: vis, vencidas, aVencer, graves, atrasados, situacao, motivos });
  }

  function resumo(d = GC.data.predios) {
    const ps = lista(d).map((p, i) => avaliar(p, i, d))
      .sort((a, b) => ORDEM[a.situacao] - ORDEM[b.situacao] || b.graves.length - a.graves.length || b.vencidas.length - a.vencidas.length || b.chamados.length - a.chamados.length);
    const chamados = ps.flatMap((p) => p.chamados.map((x) => Object.assign({ predioNome: p.nome, bairroId: p.bairroId, pastaUsuaria: p.pastaUsuaria }, x)))
      .sort((a, b) => GRAV[a.gravidade] - GRAV[b.gravidade] || b.diasAberto - a.diasAberto);
    const vistorias = ps.flatMap((p) => p.vistorias.filter((v) => v.situacao !== 'ok').map((v) => Object.assign({ predioId: p.id, predioNome: p.nome, bairroId: p.bairroId }, v)))
      .sort((a, b) => a.faltamDias - b.faltamDias);
    const porTipo = {};
    Object.keys(d.tiposChamado).forEach((t) => { porTipo[t] = chamados.filter((x) => x.tipo === t).length; });
    const porPasta = {};
    chamados.forEach((x) => { porPasta[x.pastaUsuaria] = (porPasta[x.pastaUsuaria] || 0) + 1; });
    return {
      predios: ps,
      criticos: ps.filter((p) => p.situacao === 'critica'),
      emAtencao: ps.filter((p) => p.situacao === 'atencao'),
      chamados,
      chamadosGraves: chamados.filter((x) => x.gravidade === 'alta'),
      chamadosAtrasados: chamados.filter((x) => x.atrasado),
      porTipo,
      porPasta,
      vistoriasVencidas: vistorias.filter((v) => v.situacao === 'vencida'),
      vistoriasAVencer: vistorias.filter((v) => v.situacao === 'a_vencer'),
      mediaDiasAberto: chamados.length ? Math.round(chamados.reduce((s, x) => s + x.diasAberto, 0) / chamados.length) : 0,
    };
  }

  // Número do interruptor no painel Camadas: prédios em situação crítica.
  function contagemCamada() {
    const r = resumo();
    return { total: r.predios.length, alerta: r.criticos.length, rotulo: ['prédio', 'prédios'] };
  }

  function dentro([y, x], poligono) {
    let inside = false;
    for (let i = 0, j = poligono.length - 1; i < poligono.length; j = i++) {
      const [yi, xi] = poligono[i];
      const [yj, xj] = poligono[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }

  GC.predios = { resumo, avaliar, lista, contagemCamada, dentro };
})(window.GC = window.GC || {});
