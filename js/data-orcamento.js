(function (GC) {
  // Custo e orçamento por bairro: quanto do empenhado de cada secretaria chega a cada bairro (R$ por habitante)
  // e onde a obra já recebeu mais do que fez.
  // Não há dado novo de valor: o empenhado vem do MESMO GC.gestao.orcamento() do widget Orçamento, e as obras
  // do MESMO GC.obras.resumo() da camada Obras. Aqui fica só quanto cada bairro recebe de cada secretaria por
  // morador (onde estão as unidades, as rotas e o efetivo) e quanto de cada orçamento dá para pôr num bairro
  // (o resto é sede, folha da administração, frota central: cidade toda).
  // Escrito à mão, mas coerente: Vila Nova pesa na Saúde (Hospital Municipal), o Centro na Segurança e na
  // Mobilidade, a Defesa Civil e a Assistência vão para Alto da Serra e Lagoa Azul, e o Parque Industrial
  // (pouca escola, pouca UBS) e o Jardim das Flores ficam abaixo da média por habitante.

  // Parte do empenhado de cada secretaria que se gasta num bairro (o resto é cidade toda).
  const REGIONALIZAVEL = { saude: 0.7, educacao: 0.85, infraestrutura: 0.55, seguranca: 0.45, mobilidade: 0.5, limpeza: 0.9, defesa_civil: 0.5, assistencia: 0.75 };

  // Quanto o bairro recebe de cada secretaria por morador, contra a média da cidade (1 = média). O valor em
  // reais sai da população do bairro × este fator, normalizado pelos bairros da cidade aberta.
  // Bairro sem linha aqui (as cidades pequena e grande de js/cidade.js têm outros): fator estável tirado do id.
  const INTENSIDADE = {
    alto_da_serra: { saude: 0.87, educacao: 1.15, infraestrutura: 1.12, seguranca: 0.75, mobilidade: 0.56, limpeza: 0.84, defesa_civil: 2.8, assistencia: 1.77 },
    bela_vista: { saude: 0.86, educacao: 1.07, infraestrutura: 0.9, seguranca: 0.76, mobilidade: 1.11, limpeza: 0.97, defesa_civil: 0.35, assistencia: 0.55 },
    jardim_das_flores: { saude: 0.58, educacao: 0.9, infraestrutura: 0.72, seguranca: 0.72, mobilidade: 0.64, limpeza: 0.96, defesa_civil: 0.4, assistencia: 0.8 },
    parque_industrial: { saude: 0.54, educacao: 0.54, infraestrutura: 1.73, seguranca: 1.39, mobilidade: 2.08, limpeza: 1.04, defesa_civil: 0.69, assistencia: 0.69 },
    lagoa_azul: { saude: 1.15, educacao: 1.15, infraestrutura: 1.02, seguranca: 0.81, mobilidade: 0.71, limpeza: 1.02, defesa_civil: 2.44, assistencia: 2.03 },
    centro: { saude: 1.08, educacao: 0.81, infraestrutura: 1.15, seguranca: 1.57, mobilidade: 1.47, limpeza: 1.1, defesa_civil: 0.94, assistencia: 0.63 },
    vila_nova: { saude: 1.63, educacao: 1.13, infraestrutura: 0.91, seguranca: 0.85, mobilidade: 0.79, limpeza: 0.97, defesa_civil: 0.37, assistencia: 0.79 },
    porto_dourado: { saude: 0.83, educacao: 1.1, infraestrutura: 0.8, seguranca: 1.07, mobilidade: 0.89, limpeza: 1.07, defesa_civil: 0.71, assistencia: 1.25 },
  };

  // Faixas do R$ por habitante contra a média da cidade.
  const FAIXA_BAIXA = 0.85; // abaixo de 85% da média = "abaixo da média"
  const FAIXA_ALTA = 1.15; // acima de 115% = "acima da média"

  // Onde fica o pino do bairro (a partir do centro), longe dos pinos de obra e de economia.
  const DESLOC = [-0.0042, 0.0005];
  const MAX_PINOS = 30;

  GC.data.orcamento = { regionalizavel: REGIONALIZAVEL, intensidade: INTENSIDADE, faixaBaixa: FAIXA_BAIXA, faixaAlta: FAIXA_ALTA };

  // ---- cálculos ----
  const r1 = (n) => Math.round(n * 10) / 10;
  const bairroDe = (id) => GC.data.bairros.find((b) => b.id === id);
  const ponto = (b) => ({ lat: +(b.centro[0] + DESLOC[0]).toFixed(5), lng: +(b.centro[1] + DESLOC[1]).toFixed(5) });
  // Fator de um bairro sem linha em INTENSIDADE: um nível do bairro (0,7 a 1,35) e uma variação por secretaria
  // (0,85 a 1,15), tirados do id, para a mesma cidade dar sempre o mesmo mapa.
  const sorteio = (txt) => { let h = 2166136261; for (const c of txt) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return ((h >>> 0) % 1000) / 1000; };
  function intensidade(bairroId, areaId, dados = GC.data.orcamento) {
    const escrito = dados.intensidade[bairroId];
    if (escrito && escrito[areaId] != null) return escrito[areaId];
    return (0.7 + 0.65 * sorteio(bairroId)) * (0.85 + 0.3 * sorteio(bairroId + ':' + areaId));
  }
  const faixa = (indice) => (indice < FAIXA_BAIXA ? 'baixo' : indice > FAIXA_ALTA ? 'alto' : 'medio');

  function resumo(dados = GC.data.orcamento) {
    const orc = GC.gestao.orcamento({ mesDoAno: GC.relogio && GC.relogio.mesCenario != null ? GC.relogio.mesCenario + 1 : 11 });
    const bairros = GC.data.bairros.filter((b) => b.populacao > 0);
    // Empenhado de cada secretaria em cada bairro (R$ milhões): população × intensidade, normalizado.
    const porArea = orc.areas.filter((a) => dados.regionalizavel[a.id] != null).map((a) => {
      const peso = Object.fromEntries(bairros.map((b) => [b.id, b.populacao * intensidade(b.id, a.id, dados)]));
      const somaPesos = Object.values(peso).reduce((s, n) => s + n, 0) || 1;
      const regionalMi = a.empenhadoMi * dados.regionalizavel[a.id];
      return { id: a.id, nome: a.nome, empenhadoMi: a.empenhadoMi, regionalMi, cidadeTodaMi: a.empenhadoMi - regionalMi,
        bairro: Object.fromEntries(bairros.map((b) => [b.id, (regionalMi * peso[b.id]) / somaPesos])) };
    });
    const obras = GC.obras ? GC.obras.resumo().obras.filter((o) => bairroDe(o.bairroId)) : [];

    const regionalMi = porArea.reduce((s, a) => s + a.regionalMi, 0);
    const populacao = bairros.reduce((s, b) => s + (b.populacao || 0), 0);
    const mediaPorHab = populacao ? Math.round((regionalMi * 1e6) / populacao) : 0;

    const lista = bairros.map((b) => {
      const empenhadoMi = porArea.reduce((s, a) => s + a.bairro[b.id], 0);
      const porHab = b.populacao ? Math.round((empenhadoMi * 1e6) / b.populacao) : 0;
      const indice = mediaPorHab ? Math.round((porHab / mediaPorHab) * 100) / 100 : 1;
      const areas = porArea.map((a) => ({ id: a.id, nome: a.nome, mi: r1(a.bairro[b.id]) }))
        .filter((a) => a.mi > 0).sort((x, y) => y.mi - x.mi);
      const doBairro = obras.filter((o) => o.bairroId === b.id);
      return Object.assign({ id: `orc-${b.id}`, bairroId: b.id, nome: b.nome, populacao: b.populacao }, ponto(b), {
        empenhadoMi: r1(empenhadoMi), porHab, indice, faixa: faixa(indice), areas,
        obras: doBairro.length,
        obrasContratoMi: r1(doBairro.reduce((s, o) => s + o.contratoMi, 0)),
        obrasPagoMi: r1(doBairro.reduce((s, o) => s + o.gastoMi, 0)),
      });
    }).sort((x, y) => x.porHab - y.porHab);

    // Obra que pagou à frente do que fez (o mesmo gastoAFrente da camada Obras): custo a conferir.
    const pagoAFrente = obras.filter((o) => o.gastoAFrente).map((o) => Object.assign({}, o, {
      id: `orc-obra-${o.id}`, obraId: o.id, difPp: o.gastoPct - o.avancoPct,
      aFrenteMi: r1(o.gastoMi - (o.contratoMi * o.avancoPct) / 100),
    })).sort((x, y) => y.difPp - x.difPp);

    return {
      ano: orc,
      bairros: lista,
      // Pinos no mapa: todos os bairros; na cidade grande, só as pontas (os 12 que menos recebem e os 6 que mais recebem).
      noMapa: lista.length <= MAX_PINOS ? lista : [...lista.slice(0, 12), ...lista.slice(-6)],
      mediaPorHab,
      regionalMi: r1(regionalMi),
      cidadeTodaMi: r1(porArea.reduce((s, a) => s + a.cidadeTodaMi, 0)),
      empenhadoMi: orc.empenhadoMi,
      abaixo: lista.filter((b) => b.faixa === 'baixo'),
      acima: lista.filter((b) => b.faixa === 'alto'),
      pagoAFrente,
      pagoAFrenteMi: r1(pagoAFrente.reduce((s, o) => s + o.aFrenteMi, 0)),
    };
  }

  // Número do interruptor no painel Camadas: os bairros; em vermelho, as obras com pago à frente do feito.
  function contagemCamada() {
    const r = resumo();
    return { total: r.bairros.length, alerta: r.pagoAFrente.length, rotulo: ['obra paga à frente', 'obras pagas à frente'] };
  }

  GC.orcamento = { resumo, contagemCamada, faixa, intensidade };
})(window.GC = window.GC || {});
