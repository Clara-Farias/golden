(function (GC) {
  // Economia local: empresas abertas e fechadas por bairro (12 meses), emprego formal (saldo de vagas com
  // carteira, no formato do CAGED) por bairro e região, e a fila de alvarás de funcionamento.
  // Não há secretaria de desenvolvimento econômico em GC.data.areas: o alvará passa pela Vigilância Sanitária
  // (Saúde), pelo uso do solo (Obras e Infraestrutura) e pelos Bombeiros (estadual, fora da Prefeitura).
  // Escrito à mão, mas coerente: o Parque Industrial puxa o emprego (polo de logística), Lagoa Azul e Alto da
  // Serra fecham mais do que abrem e o Porto Dourado virou para o negativo desde julho.
  const META_DIAS = 30; // prazo para o alvará sair, contado do pedido
  const DIA_MS = 86400000;

  // Meses fechados (do mais antigo ao último), os mesmos rótulos para todas as séries.
  const meses = GC.relogio.meses(12);

  // Regiões do emprego formal (como o CAGED agrupa os bairros da cidade).
  const regioes = [
    { id: 'oeste', nome: 'Região Oeste', bairros: ['alto_da_serra', 'lagoa_azul'] },
    { id: 'central', nome: 'Região Central', bairros: ['centro', 'bela_vista'] },
    { id: 'leste', nome: 'Região Leste', bairros: ['jardim_das_flores', 'vila_nova'] },
    { id: 'porto', nome: 'Polo Industrial e Porto', bairros: ['parque_industrial', 'porto_dourado'] },
  ];

  // Por bairro, mês a mês: empresas abertas, fechadas e saldo de vagas com carteira; estoque = vínculos ativos.
  // desloc: onde fica o pino do bairro (a partir do centro).
  const porBairro = {
    centro: { desloc: [0.0035, -0.0045], estoque: 14200,
      abertas: [24, 27, 18, 19, 22, 21, 23, 20, 22, 24, 21, 23], fechadas: [17, 15, 24, 20, 18, 17, 19, 18, 16, 18, 17, 19],
      empregos: [85, 210, -160, 40, 60, 55, 70, 45, 50, 65, 48, 72] },
    bela_vista: { desloc: [0.0035, -0.0045], estoque: 6800,
      abertas: [15, 17, 11, 12, 14, 13, 15, 14, 13, 15, 14, 16], fechadas: [9, 8, 12, 10, 9, 8, 10, 9, 8, 9, 9, 10],
      empregos: [40, 95, -60, 25, 30, 28, 35, 22, 26, 30, 25, 34] },
    jardim_das_flores: { desloc: [0.0035, 0.0040], estoque: 4100,
      abertas: [10, 12, 8, 9, 10, 11, 10, 9, 11, 10, 9, 11], fechadas: [8, 7, 10, 9, 8, 8, 9, 7, 8, 8, 7, 9],
      empregos: [22, 60, -45, 15, 18, 20, 16, 14, 18, 15, 12, 19] },
    parque_industrial: { desloc: [0.0040, -0.0030], estoque: 9600,
      abertas: [5, 6, 4, 5, 6, 7, 6, 6, 7, 8, 7, 8], fechadas: [3, 2, 4, 3, 3, 2, 3, 3, 2, 3, 2, 3],
      empregos: [60, 40, -20, 55, 80, 95, 70, 65, 110, 120, 90, 105] },
    lagoa_azul: { desloc: [-0.0040, -0.0045], estoque: 1900,
      abertas: [5, 7, 4, 4, 5, 4, 5, 4, 5, 4, 4, 5], fechadas: [6, 5, 8, 7, 6, 7, 6, 7, 6, 7, 8, 7],
      empregos: [-8, 15, -30, -12, -5, -10, -6, -14, -9, -11, -15, -12] },
    alto_da_serra: { desloc: [0.0040, -0.0050], estoque: 1500,
      abertas: [4, 6, 3, 4, 4, 5, 4, 4, 5, 4, 4, 4], fechadas: [5, 4, 6, 5, 4, 5, 5, 4, 5, 5, 4, 6],
      empregos: [-4, 12, -22, -6, 2, -3, -5, -2, -6, -4, -8, -5] },
    vila_nova: { desloc: [0.0040, 0.0045], estoque: 5200,
      abertas: [12, 14, 9, 11, 12, 12, 13, 11, 12, 13, 12, 14], fechadas: [9, 8, 11, 10, 9, 9, 10, 9, 9, 10, 9, 10],
      empregos: [30, 80, -50, 20, 25, 22, 28, 18, 24, 26, 20, 27] },
    porto_dourado: { desloc: [-0.0040, -0.0040], estoque: 3900,
      abertas: [9, 11, 8, 8, 9, 8, 6, 6, 5, 5, 4, 5], fechadas: [6, 5, 7, 6, 6, 6, 6, 7, 7, 8, 8, 9],
      empregos: [15, 35, -25, 8, 10, 5, 0, -6, -12, -18, -20, -25] },
  };

  // Etapas do alvará de funcionamento e quem responde por cada uma.
  const ETAPAS = {
    vigilancia: { nome: 'Vigilância Sanitária', responsavel: 'Secretaria de Saúde', area: 'saude' },
    bombeiros: { nome: 'Bombeiros', responsavel: 'Corpo de Bombeiros (estadual)', area: null },
    uso_solo: { nome: 'Uso do solo', responsavel: 'Secretaria de Obras e Infraestrutura', area: 'infraestrutura' },
  };

  // Fila de alvarás: pedido de uma empresa (nunca de pessoa física), com o que travou e as vagas que ela promete.
  // a(protocolo, atividade, nome fantasia, bairro, deslocamento, pedido em, na etapa desde, etapa, pendência, vagas)
  const a = (protocolo, atividade, nome, bairroId, desloc, pedidoEm, etapaDesde, etapa, pendencia, vagas) =>
    ({ id: `alv-${protocolo.slice(-5)}`, protocolo, atividade, nome, bairroId, desloc, pedidoEm: GC.relogio.data(pedidoEm), etapaDesde: GC.relogio.data(etapaDesde), etapa, pendencia, vagas });
  const alvaras = [
    a('ALV-2026-01184', 'Restaurante', 'Cantina da Praça', 'centro', [-0.0030, 0.0030], '2026-08-18', '2026-09-02', 'vigilancia', 'Vistoria da cozinha remarcada duas vezes', 12),
    a('ALV-2026-01207', 'Galpão de logística', 'Rota Sul Logística', 'parque_industrial', [-0.0035, 0.0025], '2026-08-04', '2026-08-25', 'bombeiros', 'Aguarda a vistoria do sistema contra incêndio', 85),
    a('ALV-2026-01262', 'Academia', 'Academia Movimento', 'vila_nova', [-0.0030, -0.0040], '2026-09-01', '2026-09-08', 'uso_solo', 'Atividade fora do previsto para a rua: precisa de parecer', 8),
    a('ALV-2026-01290', 'Padaria', 'Pão da Serra', 'alto_da_serra', [-0.0030, 0.0045], '2026-09-10', '2026-09-24', 'vigilancia', 'Falta o laudo de potabilidade da água', 6),
    a('ALV-2026-01311', 'Clínica odontológica', 'Sorriso Lagoa', 'lagoa_azul', [0.0030, 0.0040], '2026-09-15', '2026-09-22', 'vigilancia', 'Projeto do raio X em análise', 5),
    a('ALV-2026-01335', 'Oficina mecânica', 'Auto Center Porto', 'porto_dourado', [0.0035, 0.0035], '2026-09-22', '2026-09-29', 'uso_solo', 'Sem plano aprovado para o descarte de óleo', 7),
    a('ALV-2026-01352', 'Mercado', 'Mercado Bela Vista', 'bela_vista', [-0.0035, 0.0040], '2026-09-28', '2026-10-06', 'bombeiros', 'Aguarda a vistoria dos Bombeiros', 22),
    a('ALV-2026-01398', 'Bar e restaurante', 'Bar do Cais', 'porto_dourado', [0.0030, -0.0035], '2026-10-12', '2026-10-20', 'bombeiros', 'Aguarda a vistoria dos Bombeiros', 6),
    a('ALV-2026-01420', 'Salão de beleza', 'Studio Flor', 'jardim_das_flores', [-0.0035, -0.0030], '2026-10-16', '2026-10-23', 'vigilancia', 'Aguarda a vistoria sanitária', 4),
    a('ALV-2026-01437', 'Farmácia', 'Farma Vila', 'vila_nova', [0.0030, -0.0045], '2026-10-20', '2026-10-27', 'vigilancia', 'Aguarda a vistoria sanitária', 9),
    a('ALV-2026-01455', 'Loja de roupas', 'Ateliê Centro', 'centro', [-0.0040, -0.0030], '2026-10-26', '2026-10-28', 'uso_solo', 'Conferência do endereço no zoneamento', 4),
    a('ALV-2026-01469', 'Indústria de embalagens', 'Embalagens Dourada', 'parque_industrial', [0.0030, 0.0045], '2026-10-29', '2026-11-02', 'bombeiros', 'Aguarda a vistoria dos Bombeiros', 40),
  ];

  GC.data.economia = { meses, regioes, porBairro, etapas: ETAPAS, alvaras, metaDias: META_DIAS };

  // ---- cálculos ----
  const soma = (l) => l.reduce((s, n) => s + n, 0);
  const utc = (iso) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
  const diasDesde = (iso) => Math.round((utc(GC.relogio.hoje) - utc(iso)) / DIA_MS);
  const bairro = (id) => GC.data.bairros.find((b) => b.id === id);
  const ponto = (bairroId, [dLat, dLng]) => {
    const [lat, lng] = bairro(bairroId).centro;
    return { lat: +(lat + dLat).toFixed(5), lng: +(lng + dLng).toFixed(5) };
  };

  // Alvará: dias na fila (desde o pedido) contra a meta. Passou da meta = atenção; passou do dobro = crítica.
  function avaliarAlvara(x, meta = META_DIAS) {
    const diasNaFila = diasDesde(x.pedidoEm);
    const diasNaEtapa = diasDesde(x.etapaDesde);
    const situacao = diasNaFila > meta * 2 ? 'critica' : diasNaFila > meta ? 'atencao' : 'ok';
    return Object.assign({}, x, ponto(x.bairroId, x.desloc), {
      diasNaFila, diasNaEtapa, atrasoDias: Math.max(0, diasNaFila - meta), atrasado: diasNaFila > meta, situacao,
      etapaNome: ETAPAS[x.etapa].nome, responsavel: ETAPAS[x.etapa].responsavel,
    });
  }

  // Bairro: saldo de empresas em 12 meses. Negativo = crítica; positivo, mas fechando mais do que abre nos
  // últimos 3 meses = atenção.
  function avaliarBairro(id, d) {
    const b = bairro(id);
    const saldoMensal = d.abertas.map((n, i) => n - d.fechadas[i]);
    const saldo12 = soma(saldoMensal);
    const saldo3 = soma(saldoMensal.slice(-3));
    const situacao = saldo12 < 0 ? 'critica' : saldo3 < 0 ? 'atencao' : 'ok';
    const u = d.abertas.length - 1;
    return Object.assign({ id: `eco-${id}`, bairroId: id, nome: b.nome, regiao: (regioes.find((r) => r.bairros.includes(id)) || {}).id }, ponto(id, d.desloc), {
      abertas12: soma(d.abertas), fechadas12: soma(d.fechadas), saldo12, saldo3, saldoMensal,
      abertasMes: d.abertas[u], fechadasMes: d.fechadas[u], saldoMes: saldoMensal[u],
      empregos12: soma(d.empregos), empregosMes: d.empregos[u], empregosSerie: d.empregos.slice(), estoque: d.estoque,
      situacao,
    });
  }

  const ORDEM = { critica: 0, atencao: 1, ok: 2 };
  // Só os bairros que existem na cidade aberta (a cidade pequena de js/cidade.js não tem todos).
  function resumo(dados = GC.data.economia) {
    const meta = dados.metaDias;
    const existentes = Object.entries(dados.porBairro).filter(([id]) => bairro(id));
    const bairros = existentes.map(([id, d]) => avaliarBairro(id, d))
      .sort((x, y) => ORDEM[x.situacao] - ORDEM[y.situacao] || x.saldo12 - y.saldo12);
    const fila = dados.alvaras.filter((x) => bairro(x.bairroId)).map((x) => avaliarAlvara(x, meta)).sort((x, y) => y.diasNaFila - x.diasNaFila);
    const atrasados = fila.filter((x) => x.atrasado);
    const porMes = (campo) => dados.meses.map((_, i) => soma(existentes.map(([, d]) => d[campo][i])));
    const serieAbertas = porMes('abertas');
    const serieFechadas = porMes('fechadas');
    const serieEmpregos = porMes('empregos');
    const u = dados.meses.length - 1;
    const porEtapa = Object.entries(ETAPAS).map(([id, e]) => ({
      id, nome: e.nome, responsavel: e.responsavel, area: e.area,
      total: fila.filter((x) => x.etapa === id).length,
      atrasados: atrasados.filter((x) => x.etapa === id).length,
    })).sort((x, y) => y.atrasados - x.atrasados || y.total - x.total);
    const regioesR = dados.regioes.map((r) => {
      const bs = bairros.filter((b) => r.bairros.includes(b.bairroId));
      return { id: r.id, nome: r.nome, bairros: r.bairros.filter((id) => bs.some((b) => b.bairroId === id)),
        empregos12: soma(bs.map((b) => b.empregos12)), empregosMes: soma(bs.map((b) => b.empregosMes)),
        estoque: soma(bs.map((b) => b.estoque)), saldoEmpresas12: soma(bs.map((b) => b.saldo12)) };
    }).filter((r) => r.bairros.length).sort((x, y) => y.empregos12 - x.empregos12);
    return {
      meses: dados.meses.slice(),
      metaDias: meta,
      bairros,
      regioes: regioesR,
      cidade: {
        abertas12: soma(serieAbertas), fechadas12: soma(serieFechadas), saldo12: soma(serieAbertas) - soma(serieFechadas),
        abertasMes: serieAbertas[u], fechadasMes: serieFechadas[u], saldoMes: serieAbertas[u] - serieFechadas[u],
        empregos12: soma(serieEmpregos), empregosMes: serieEmpregos[u], empregosMesAnterior: serieEmpregos[u - 1],
        estoque: soma(bairros.map((b) => b.estoque)),
        serieAbertas, serieFechadas, serieEmpregos,
      },
      fila,
      atrasados,
      criticos: atrasados.filter((x) => x.situacao === 'critica'),
      porEtapa,
      gargalo: porEtapa[0] && porEtapa[0].atrasados ? porEtapa[0] : null,
      vagasTravadas: soma(atrasados.map((x) => x.vagas)),
      fechandoMais: bairros.filter((b) => b.saldo12 < 0),
      emAlerta: bairros.filter((b) => b.situacao !== 'ok'),
    };
  }

  // Número do interruptor no painel Camadas: os alvarás na fila; em vermelho, os parados além do prazo.
  function contagemCamada() {
    const r = resumo();
    return { total: r.fila.length, alerta: r.atrasados.length, rotulo: ['alvará parado', 'alvarás parados'] };
  }

  // Ponto dentro do polígono (para os testes conferirem os pinos).
  function dentro([y, x], poligono) {
    let inside = false;
    for (let i = 0, j = poligono.length - 1; i < poligono.length; j = i++) {
      const [yi, xi] = poligono[i];
      const [yj, xj] = poligono[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }

  GC.economia = { resumo, contagemCamada, avaliarAlvara, avaliarBairro, dentro, ETAPAS };
})(window.GC = window.GC || {});
