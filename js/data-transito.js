(function (GC) {
  // Segurança no trânsito (Mobilidade): pontos críticos de acidente nos últimos 12 meses, atropelamentos e a
  // escola mais próxima quando ela fica a menos de RAIO_ESCOLA_M. Escrito à mão, mas coerente: a Ponte do Porto
  // é a do acidente aberto (oc-28) e o cruzamento principal do Centro é o do semáforo apagado (oc-19).
  // As escolas vêm de GC.educacao / GC.data.educacao na hora da chamada (podem não estar carregadas).
  const RAIO_ESCOLA_M = 300;

  // Bairro que não existe na cidade aberta (a pequena tem outros nomes): um bairro dela, sempre o mesmo para o id.
  const centroDe = (id) => {
    const bs = GC.data.bairros;
    const b = bs.find((x) => x.id === id);
    if (b) return b.centro;
    let h = 0;
    for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    return bs[h % bs.length].centro;
  };
  // p(id, nome, tipo, bairro, desloc, acidentes com vítima, sem vítima, mortes, atropelamentos,
  //   [acidentes no semestre anterior, no último semestre], horário de pico)
  const p = (id, nome, tipo, bairroId, [dLat, dLng], comVitima, semVitima, mortes, atropelamentos, semestres, pico) => {
    const [lat, lng] = centroDe(bairroId);
    return { id, nome, tipo, bairroId, lat: +(lat + dLat).toFixed(5), lng: +(lng + dLng).toFixed(5), comVitima, semVitima, mortes, atropelamentos, semestres, pico };
  };

  const pontos = [
    p('tr-central-xv', 'Av. Central × Rua XV de Novembro', 'cruzamento', 'centro', [0.002, -0.002], 14, 31, 1, 4, [19, 26], '17h às 19h'),
    p('tr-aurora-matriz', 'Rua Aurora × Rua da Matriz', 'cruzamento', 'centro', [-0.004, 0.005], 6, 9, 0, 5, [6, 9], '7h às 8h e 17h às 18h'),
    p('tr-ponte-porto', 'Ponte do Porto', 'trecho', 'porto_dourado', [-0.004, -0.004], 9, 22, 2, 0, [12, 19], '6h às 8h'),
    p('tr-brasil-acacias', 'Av. Brasil × Rua das Acácias', 'cruzamento', 'bela_vista', [-0.0035, 0.0005], 7, 12, 0, 3, [8, 11], '7h às 8h e 12h às 13h'),
    p('tr-palmeiras-ipe', 'Rua das Palmeiras × Rua Ipê', 'cruzamento', 'vila_nova', [-0.0045, 0.003], 5, 7, 0, 4, [5, 7], '7h às 8h e 17h às 18h'),
    p('tr-estrada-lagoa', 'Estrada da Lagoa, trecho da escola', 'trecho', 'lagoa_azul', [0.0045, -0.001], 4, 6, 0, 2, [4, 6], '7h às 8h'),
    p('tr-vd040', 'Rodovia VD-040, trecho do Parque Industrial', 'trecho', 'parque_industrial', [0.004, -0.004], 11, 18, 1, 1, [16, 13], '5h às 7h'),
    p('tr-flores-girassol', 'Av. das Flores × Rua Girassol', 'cruzamento', 'jardim_das_flores', [-0.003, 0.003], 3, 14, 0, 0, [9, 8], '18h às 19h'),
    p('tr-curva-serra', 'Curva da Serra, Estrada do Mirante', 'trecho', 'alto_da_serra', [-0.004, -0.004], 6, 5, 1, 0, [6, 5], 'noite'),
    p('tr-central-dourada', 'Av. Central × Av. Dourada', 'cruzamento', 'centro', [-0.005, -0.001], 10, 27, 0, 2, [17, 20], '17h às 19h'),
  ];

  GC.data.transito = { pontos, raioEscolaM: RAIO_ESCOLA_M, periodo: '12 meses', fonte: 'Boletins de acidente da Guarda Municipal e do SAMU' };

  // ---- cálculos ----
  // Distância em metros (plano local: na escala de um bairro o erro é desprezível).
  function distanciaM(a, b) {
    const k = 111320;
    const dy = (a.lat - b.lat) * k;
    const dx = (a.lng - b.lng) * k * Math.cos((a.lat * Math.PI) / 180);
    return Math.sqrt(dx * dx + dy * dy);
  }
  function escolasAgora() {
    try {
      if (GC.educacao) return GC.educacao.resumo().escolas;
      return (GC.data.educacao && GC.data.educacao.escolas) || [];
    } catch (e) { return []; }
  }
  function escolaPerto(ponto, escolas, raio = RAIO_ESCOLA_M) {
    let melhor = null;
    for (const e of escolas) {
      const d = distanciaM(ponto, e);
      if (d <= raio && (!melhor || d < melhor.distanciaM)) melhor = { id: e.id, nome: e.nome, distanciaM: Math.round(d / 10) * 10 };
    }
    return melhor;
  }
  function tendencia([anterior, atual]) {
    const variacaoPct = anterior ? Math.round(((atual - anterior) / anterior) * 100) : 0;
    return { anterior, atual, variacaoPct, sentido: variacaoPct > 10 ? 'subindo' : variacaoPct < -10 ? 'caindo' : 'estavel' };
  }
  // Medida sugerida: a escola vem primeiro (atropelamento perto de escola), depois o pedestre, o cruzamento e a velocidade.
  function medida(x) {
    if (x.escola && x.atropelamentos) return `Agente de trânsito na entrada e na saída da ${x.escola.nome} e faixa elevada na travessia`;
    if (x.atropelamentos >= 2) return 'Faixa elevada e semáforo com tempo para o pedestre';
    if (x.tipo === 'trecho' && x.mortes) return 'Fiscalização de velocidade com radar no trecho';
    if (x.tipo === 'cruzamento' && x.comVitima >= 8) return 'Revisar o tempo do semáforo e fiscalizar o avanço de sinal';
    return 'Reforçar a sinalização e fiscalizar no horário de pico';
  }
  const PESO_SIT = { critica: 3, atencao: 2, ok: 1 };
  function avaliar(ponto, escolas = escolasAgora()) {
    const escola = escolaPerto(ponto, escolas);
    const t = tendencia(ponto.semestres);
    const acidentes = ponto.comVitima + ponto.semVitima;
    const x = Object.assign({}, ponto, { escola, acidentes, tendencia: t, atropelamentoPertoEscola: !!(escola && ponto.atropelamentos) });
    // Crítico: morte com alta, 2 mortes ou mais, ou atropelamentos repetidos perto de escola.
    x.situacao = (ponto.mortes >= 2 || (ponto.mortes && t.sentido === 'subindo') || (escola && ponto.atropelamentos >= 3)) ? 'critica'
      : (ponto.comVitima >= 5 || t.sentido === 'subindo' || x.atropelamentoPertoEscola) ? 'atencao' : 'ok';
    // Índice de gravidade (ordena a lista): morte pesa mais que vítima, que pesa mais que dano material.
    x.indice = ponto.mortes * 10 + ponto.comVitima * 3 + ponto.semVitima + ponto.atropelamentos * 4 + (x.atropelamentoPertoEscola ? 10 : 0);
    x.medida = medida(x);
    return x;
  }

  function resumo(lista = pontos, escolas = escolasAgora()) {
    const avaliados = lista.map((x) => avaliar(x, escolas))
      .sort((a, b) => PESO_SIT[b.situacao] - PESO_SIT[a.situacao] || b.indice - a.indice);
    const soma = (f) => avaliados.reduce((s, x) => s + f(x), 0);
    const pertoEscola = avaliados.filter((x) => x.atropelamentoPertoEscola);
    const porBairro = {};
    GC.data.bairros.forEach((b) => { porBairro[b.id] = 0; });
    avaliados.forEach((x) => { porBairro[x.bairroId] = (porBairro[x.bairroId] || 0) + x.acidentes; });
    const piorBairroId = Object.entries(porBairro).sort((a, b) => b[1] - a[1])[0][0];
    return {
      pontos: avaliados,
      criticos: avaliados.filter((x) => x.situacao === 'critica'),
      acidentes: soma((x) => x.acidentes),
      comVitima: soma((x) => x.comVitima),
      semVitima: soma((x) => x.semVitima),
      mortes: soma((x) => x.mortes),
      atropelamentos: soma((x) => x.atropelamentos),
      pertoEscola,
      atropelamentosPertoEscola: pertoEscola.reduce((s, x) => s + x.atropelamentos, 0),
      tendencia: tendencia([soma((x) => x.semestres[0]), soma((x) => x.semestres[1])]),
      porBairro,
      piorBairroId,
      periodo: GC.data.transito.periodo,
      fonte: GC.data.transito.fonte,
    };
  }

  // Número do interruptor no painel Camadas: pontos críticos (em vermelho) de todos os mapeados.
  function contagemCamada() {
    const r = resumo();
    return { total: r.pontos.length, alerta: r.criticos.length, rotulo: ['ponto crítico', 'pontos críticos'] };
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

  GC.transito = { resumo, avaliar, contagemCamada, distanciaM, dentro };
})(window.GC = window.GC || {});
