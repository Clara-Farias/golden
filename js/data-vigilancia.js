(function (GC) {
  // Vigilância em Saúde: cobertura vacinal por bairro, LIRAa (índice de infestação predial do Aedes), casos
  // suspeitos de dengue nas últimas semanas, pontos estratégicos do Aedes e chamados de zoonoses.
  // Escrito à mão, mas coerente com a cidade: a Lagoa Azul tem o surto de dengue aberto (oc-27, 48 casos na
  // semana, 2,4 vezes a média) e por isso fica com o LIRAa em risco e a vacinação abaixo da meta.
  // As posições saem do bairro na hora da chamada (centro + deslocamento), porque js/cidade.js pode mover ou
  // tirar bairros depois deste arquivo carregar.

  const data = (iso) => GC.relogio.data(iso);
  const DIA_MS = 86400000;
  const diasDesde = (iso) => Math.max(0, Math.round((Date.parse(GC.relogio.hoje) - Date.parse(iso)) / DIA_MS));

  // Metas do Ministério da Saúde: 95% no calendário infantil, 90% na vacina da gripe para 60 anos ou mais.
  // LIRAa: abaixo de 1% satisfatório, de 1% a 3,9% alerta, 4% ou mais risco de surto.
  const META = { infantil: 95, gripe60: 90 };
  const LIMITE_LIRAA = { alerta: 1, risco: 4 };

  // Último ciclo do LIRAa (o 5º do ano) e as semanas de casos.
  const ciclo = { nome: '5º ciclo do LIRAa', realizadoEm: data('2026-10-23'), imoveis: 2140 };
  const SEMANAS = ['há 4 semanas', 'há 3 semanas', 'há 2 semanas', 'últimos 7 dias'];

  // Por bairro: cobertura infantil e gripe 60+ (%), LIRAa do ciclo atual e do anterior (%), casos suspeitos
  // de dengue por semana (da mais antiga à de agora) e a média para a época (mesmas semanas nos últimos anos).
  const b = (infantil, gripe60, liraa, liraaAnterior, casos, mediaSemana) => ({ infantil, gripe60, liraa, liraaAnterior, casos, mediaSemana });
  const porBairro = {
    alto_da_serra: b(89, 78, 2.1, 1.6, [5, 6, 8, 9], 7),
    bela_vista: b(97, 88, 0.6, 0.8, [2, 1, 3, 2], 3),
    jardim_das_flores: b(95, 85, 1.4, 1.1, [4, 5, 4, 6], 5),
    parque_industrial: b(92, 80, 3.2, 2.4, [6, 7, 9, 11], 6),
    lagoa_azul: b(84, 71, 5.4, 3.1, [16, 22, 31, 48], 20),
    centro: b(91, 86, 0.9, 1.2, [5, 4, 6, 5], 6),
    vila_nova: b(88, 76, 2.8, 2.2, [7, 9, 12, 15], 10),
    porto_dourado: b(94, 83, 4.1, 2.6, [9, 11, 14, 19], 11),
  };

  // Pontos estratégicos do Aedes (visitados a cada 15 dias): situação da última visita.
  // foco = larvas encontradas e ainda sem tratamento; tratado = foco tratado, revisita marcada; limpo = sem foco.
  const pe = (id, nome, tipo, bairroId, desloc, situacao, depositos, visita, nota) =>
    ({ id, grupo: 'aedes', nome, tipo, bairroId, desloc, situacao, depositos, desde: data(visita), nota });
  // Chamados de zoonoses: aberta = esperando equipe; em_campo = equipe atendendo; encerrada = resolvido.
  const zo = (id, nome, tipo, bairroId, desloc, situacao, aberto, nota) =>
    ({ id, grupo: 'zoonose', nome, tipo, bairroId, desloc, situacao, desde: data(aberto), nota });

  const pontos = [
    pe('pe-borracharia-lagoa', 'Borracharia do Lago', 'borracharia', 'lagoa_azul', [0.003, -0.002], 'foco', 14, '2026-11-03', 'Pneus com água parada no pátio, sem cobertura'),
    pe('pe-terreno-lagoa', 'Terreno baldio da Rua das Garças', 'terreno_baldio', 'lagoa_azul', [-0.003, -0.003], 'foco', 9, '2026-11-04', 'Lixo e entulho acumulando água da chuva'),
    pe('pe-ferro-velho-porto', 'Ferro-velho São Jorge', 'ferro_velho', 'porto_dourado', [0.003, 0.003], 'foco', 11, '2026-11-02', 'Sucata a céu aberto; o dono pediu prazo para cobrir'),
    pe('pe-borracharia-porto', 'Borracharia da Avenida do Porto', 'borracharia', 'porto_dourado', [-0.002, 0.0035], 'tratado', 6, '2026-10-30', 'Larvicida aplicado; revisita em 15 dias'),
    pe('pe-ferro-velho-industrial', 'Ferro-velho do Distrito', 'ferro_velho', 'parque_industrial', [0.002, -0.003], 'tratado', 7, '2026-10-29', 'Sucata coberta com lona depois da notificação'),
    pe('pe-cemiterio-vila', 'Cemitério Municipal', 'cemiterio', 'vila_nova', [-0.003, 0.003], 'tratado', 4, '2026-10-31', 'Vasos com areia; equipe volta na próxima semana'),
    pe('pe-terreno-serra', 'Terreno baldio da Rua do Mirante', 'terreno_baldio', 'alto_da_serra', [0.003, 0.002], 'limpo', 0, '2026-11-01', 'Limpo pelo mutirão de outubro'),
    pe('pe-borracharia-centro', 'Borracharia Central', 'borracharia', 'centro', [0.003, 0.002], 'limpo', 0, '2026-11-02', 'Pneus guardados em galpão coberto'),
    pe('pe-reciclagem-jardim', 'Depósito de recicláveis das Flores', 'reciclagem', 'jardim_das_flores', [-0.003, 0.003], 'limpo', 0, '2026-10-28', 'Material separado e coberto'),
    zo('zo-morcego-serra', 'Morcego caído em quintal', 'morcego', 'alto_da_serra', [-0.002, 0.003], 'aberta', '2026-11-05', 'Morcego no chão durante o dia: risco de raiva. Ninguém deve tocar no animal; coleta para exame'),
    zo('zo-cao-porto', 'Cão com suspeita de raiva', 'cao_suspeito', 'porto_dourado', [0.002, -0.0015], 'aberta', '2026-11-04', 'Cão agressivo mordeu um morador; observação do animal por 10 dias'),
    zo('zo-escorpiao-centro', 'Escorpiões em galeria pluvial', 'escorpiao', 'centro', [-0.003, 0.003], 'em_campo', '2026-11-02', '6 escorpiões achados por moradores em uma semana'),
    zo('zo-leish-lagoa', 'Cão com suspeita de leishmaniose', 'leishmaniose', 'lagoa_azul', [0.0015, 0.003], 'em_campo', '2026-10-31', 'Teste rápido positivo; aguarda o exame de confirmação'),
    zo('zo-escorpiao-bela', 'Escorpião em escola infantil', 'escorpiao', 'bela_vista', [0.002, -0.003], 'encerrada', '2026-10-26', 'Vistoria feita e frestas vedadas'),
  ];

  GC.data.vigilancia = { meta: META, limiteLiraa: LIMITE_LIRAA, ciclo, semanas: SEMANAS, porBairro, pontos };

  // ---- cálculos ----
  const TIPOS = {
    borracharia: 'Borracharia', ferro_velho: 'Ferro-velho', terreno_baldio: 'Terreno baldio', cemiterio: 'Cemitério', reciclagem: 'Depósito de recicláveis',
    morcego: 'Morcego (raiva)', cao_suspeito: 'Cão com suspeita de raiva', escorpiao: 'Escorpião', leishmaniose: 'Leishmaniose',
  };
  const SITUACAO = {
    foco: ['critica', 'Foco ativo'], tratado: ['atencao', 'Tratado, revisita marcada'], limpo: ['ok', 'Sem foco'],
    aberta: ['critica', 'Esperando equipe'], em_campo: ['atencao', 'Equipe atendendo'], encerrada: ['ok', 'Encerrado'],
  };
  const PESO = { critica: 0, atencao: 1, ok: 2 };

  function dentro([y, x], poligono) {
    let inside = false;
    for (let i = 0, j = poligono.length - 1; i < poligono.length; j = i++) {
      const [yi, xi] = poligono[i];
      const [yj, xj] = poligono[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }

  // Centro do bairro + deslocamento; se o bairro desta cidade for menor e o ponto cair fora, aproxima do centro.
  function posicao(bairro, [dLat, dLng]) {
    for (const f of [1, 0.6, 0.3, 0]) {
      const p = [+(bairro.centro[0] + dLat * f).toFixed(5), +(bairro.centro[1] + dLng * f).toFixed(5)];
      if (f === 0 || dentro(p, bairro.poligono)) return p;
    }
    return bairro.centro;
  }

  const nivelLiraa = (v) => (v >= LIMITE_LIRAA.risco ? 'risco' : v >= LIMITE_LIRAA.alerta ? 'alerta' : 'satisfatorio');
  const umaCasa = (n) => Math.round(n * 10) / 10;
  const media = (lista, campo) => {
    const pop = lista.reduce((s, x) => s + x.populacao, 0);
    return pop ? lista.reduce((s, x) => s + x[campo] * x.populacao, 0) / pop : 0;
  };

  function resumo() {
    const bairrosCidade = GC.data.bairros.filter((x) => porBairro[x.id]);
    const bairros = bairrosCidade.map((x) => {
      const d = porBairro[x.id];
      const casosSemana = d.casos[d.casos.length - 1];
      const nivel = nivelLiraa(d.liraa);
      const abaixoMeta = d.infantil < META.infantil;
      const razao = umaCasa(casosSemana / d.mediaSemana);
      const situacao = nivel === 'risco' ? 'critica' : (nivel === 'alerta' || abaixoMeta) ? 'atencao' : 'ok';
      return {
        id: x.id, nome: x.nome, populacao: x.populacao,
        coberturaInfantil: d.infantil, gripe60: d.gripe60, abaixoMeta, gripeAbaixo: d.gripe60 < META.gripe60,
        liraa: d.liraa, liraaAnterior: d.liraaAnterior, nivelLiraa: nivel,
        casos: d.casos.slice(), casosSemana, mediaSemana: d.mediaSemana, razao, situacao,
      };
    }).sort((a, z) => PESO[a.situacao] - PESO[z.situacao] || z.liraa - a.liraa);

    const lista = pontos.map((p) => {
      const bairro = GC.data.bairros.find((x) => x.id === p.bairroId);
      if (!bairro) return null;
      const [lat, lng] = posicao(bairro, p.desloc);
      const [cls, rotulo] = SITUACAO[p.situacao];
      return Object.assign({}, p, { lat, lng, classe: cls, rotuloSituacao: rotulo, rotuloTipo: TIPOS[p.tipo], dias: diasDesde(p.desde) });
    }).filter(Boolean).sort((a, z) => PESO[a.classe] - PESO[z.classe] || (z.depositos || 0) - (a.depositos || 0));

    const semanas = SEMANAS.map((_, i) => bairros.reduce((s, x) => s + x.casos[i], 0));
    const casosSemana = semanas[semanas.length - 1];
    const anterior = semanas[semanas.length - 2];
    const aedes = lista.filter((p) => p.grupo === 'aedes');
    const zoonoses = lista.filter((p) => p.grupo === 'zoonose');
    return {
      meta: META,
      limiteLiraa: LIMITE_LIRAA,
      ciclo,
      rotulosSemanas: SEMANAS.slice(),
      bairros,
      cidade: {
        coberturaInfantil: Math.round(media(bairros, 'coberturaInfantil')),
        gripe60: Math.round(media(bairros, 'gripe60')),
        liraa: umaCasa(media(bairros, 'liraa')),
        nivelLiraa: nivelLiraa(umaCasa(media(bairros, 'liraa'))),
        semanas,
        casosSemana,
        casosSemanaAnterior: anterior,
        variacaoPct: anterior ? Math.round(((casosSemana - anterior) / anterior) * 100) : 0,
      },
      abaixoMeta: bairros.filter((x) => x.abaixoMeta).sort((a, z) => a.coberturaInfantil - z.coberturaInfantil),
      liraaRisco: bairros.filter((x) => x.nivelLiraa === 'risco'),
      liraaAlerta: bairros.filter((x) => x.nivelLiraa === 'alerta'),
      // Onde os casos da semana passam do dobro da média para a época (o mesmo critério da regra "surto").
      casosAcimaDaMedia: bairros.filter((x) => x.razao >= 2),
      pontos: lista,
      aedes,
      zoonoses,
      focos: aedes.filter((p) => p.situacao === 'foco'),
      zoonosesAbertas: zoonoses.filter((p) => p.situacao !== 'encerrada'),
      emAlerta: lista.filter((p) => p.classe === 'critica'),
    };
  }

  // Número do interruptor do painel Camadas: quantos pontos pedem ação agora (foco ativo ou chamado sem equipe).
  function contagemCamada() {
    const r = resumo();
    return { total: r.pontos.length, alerta: r.emAlerta.length, rotulo: ['ponto de vigilância', 'pontos de vigilância'] };
  }

  GC.vigilancia = { resumo, contagemCamada, dentro, nivelLiraa, TIPOS, SITUACAO };
})(window.GC = window.GC || {});
