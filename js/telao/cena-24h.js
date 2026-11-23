(function (GC) {
  // Telão · as últimas 24 horas: ocorrências abertas por hora (as críticas em vermelho na base da barra),
  // o pico do dia e a tendência: as últimas 6 h comparadas às 6 h anteriores. Usa GC.histograma24h
  // (js/widgets-extra.js), o mesmo do widget "Últimas 24 horas". Sem nenhuma em 24 h, a cena é pulada.
  const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
  const hora = (t) => `${new Date(t).getHours()}h`;

  // Frase da tendência: 6 h mais recentes × as 6 h antes delas.
  GC.tendencia6h = function (horas) {
    const soma = (lista) => lista.reduce((s, h) => s + h.n, 0);
    const agora = soma(horas.slice(-6));
    const antes = soma(horas.slice(-12, -6));
    if (agora === antes) return { texto: `Nas últimas 6 h, ${plural(agora, 'ocorrência', 'ocorrências')}, o mesmo ritmo das 6 h anteriores`, sentido: 'igual' };
    const mais = agora > antes;
    return {
      texto: `Nas últimas 6 h, ${plural(agora, 'ocorrência', 'ocorrências')}, ${mais ? 'mais' : 'menos'} que as ${antes} das 6 h anteriores`,
      sentido: mais ? 'pior' : 'melhor',
    };
  };

  GC.cenasTelao = GC.cenasTelao || [];
  GC.cenasTelao.push({
    id: 'linha24h',
    ordem: 40,
    nome: 'Últimas 24 horas',
    descricao: 'Ocorrências abertas por hora, o pico do dia e a tendência das últimas 6 h',
    montar({ dados }) {
      if (!GC.histograma24h) return null;
      const h = GC.histograma24h(dados.todas || [], dados.agora);
      if (!h.total) return null;
      const max = Math.max(1, ...h.horas.map((x) => x.n));
      const t = GC.tendencia6h(h.horas);
      const barras = h.horas.map((x, k) => {
        const rotulo = `${hora(x.inicio)}: ${plural(x.n, 'ocorrência', 'ocorrências')}${x.criticas ? `, ${plural(x.criticas, 'crítica', 'críticas')}` : ''}`;
        return `<span class="${k === h.pico ? 'pico' : ''}${k === 23 ? ' agora' : ''}" style="--h:${Math.round((x.n / max) * 100)}%;--c:${x.n ? Math.round((x.criticas / x.n) * 100) : 0}%" title="${rotulo}"><i></i></span>`;
      }).join('');
      const eixo = [0, 6, 12, 18].map((k) => `<span>${hora(h.horas[k].inicio)}</span>`).join('') + '<span>agora</span>';
      const pico = h.pico === null ? '' : `, com pico às ${hora(h.horas[h.pico].inicio)} (${h.horas[h.pico].n})`;
      return {
        rotulo: 'Últimas 24 horas',
        sub: 'Ocorrências abertas por hora',
        titulo: `${plural(h.total, 'ocorrência aberta', 'ocorrências abertas')} em 24 h${pico}`,
        html: `<div class="t24-barras" role="img" aria-label="Ocorrências abertas por hora nas últimas 24 horas">${barras}</div>
          <p class="t24-eixo" aria-hidden="true">${eixo}</p>
          <p class="t24-tendencia ${t.sentido}">${t.sentido === 'igual' ? '' : t.sentido === 'pior' ? '▲ ' : '▼ '}${t.texto}</p>
          <p class="ts-legenda"><i class="t24-crit" aria-hidden="true"></i> parte crítica de cada hora</p>`,
      };
    },
  });
})(window.GC = window.GC || {});
