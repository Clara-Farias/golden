(function (GC) {
  // Telão · abertura de cada volta (depois da crise, se houver): a frase da cidade e quatro números grandes (críticas, prazo estourado,
  // em atendimento, tempo médio de resposta), cada um com o que mudou desde a volta anterior.
  // Os três primeiros seguem os filtros do mapa (dados.ativas são as ocorrências com pino na tela).
  const plural = (n, um, varios) => (n === 1 ? um : varios);
  const decimal = (n) => n.toLocaleString('pt-BR', { maximumFractionDigits: 1 });

  // ▲/▼ e quanto mudou; a cor diz se foi para melhor (em todos os quatro, menos é melhor).
  function variacao(agora, antes) {
    if (typeof antes !== 'number') return '';
    const d = Math.round((agora - antes) * 10) / 10;
    if (!d) return '<small class="tn-var">igual à volta anterior</small>';
    return `<small class="tn-var ${d < 0 ? 'melhor' : 'pior'}">${d > 0 ? '▲' : '▼'} ${decimal(Math.abs(d))} desde a volta anterior</small>`;
  }

  // Abertura da volta: curvas de nível no canto de cima do cartão, longe dos números (nunca atrás de dado).
  function relevo() {
    const g = GC.grafismo;
    if (!g) return '';
    const w = 400; const h = 160;
    return g.fundo(g.curvas({ w, h, cor: '#ffffff', op: 0.16, semente: 23, esp: 1, niveis: 12,
      morros: [{ x: w * 1.05, y: -h * 0.15, s: h * 0.9, a: 1.2 }, { x: w * 0.7, y: -h * 0.4, s: h * 0.6, a: 0.6 }] }), w, h, 'tn-relevo');
  }

  GC.cenasTelao = GC.cenasTelao || [];
  GC.cenasTelao.push({
    id: 'numeros',
    ordem: 10,
    nome: 'A cidade agora',
    descricao: 'Críticas, prazo estourado, equipes no local e tempo médio, com o que mudou desde a volta anterior',
    abertura: true,
    montar({ dados, fila, memoria }) {
      const at = dados.ativas || [];
      const v = {
        criticas: at.filter((o) => o.severidade === 'critica').length,
        estouradas: at.filter(GC.estourada).length,
        emCampo: at.filter((o) => o.status === 'em_campo').length,
        tempoH: dados.desempenho ? dados.desempenho.resumo.tempoMedioH : null,
      };
      const antes = memoria.antes || {};
      memoria.antes = v;
      const num = (valor, texto, classe, chave) => `<div class="tn-num ${classe}${valor ? '' : ' zero'}"><b>${valor}</b><span>${texto}</span>${variacao(v[chave], antes[chave])}</div>`;
      const itens = [
        num(v.criticas, plural(v.criticas, 'crítica', 'críticas'), 'critica', 'criticas'),
        num(v.estouradas, 'com prazo estourado', 'atrasada', 'estouradas'),
        num(v.emCampo, 'com equipe no local', 'campo', 'emCampo'),
      ];
      if (typeof v.tempoH === 'number') itens.push(`<div class="tn-num tempo"><b>${decimal(v.tempoH)} h</b><span>tempo médio de resposta (30 dias)</span>${variacao(v.tempoH, antes.tempoH)}</div>`);
      return {
        rotulo: 'A cidade agora',
        sub: fila.alertas ? `A seguir, ${fila.alertas === 1 ? 'o alerta mais urgente' : `os ${fila.alertas} alertas mais urgentes`}` : '',
        titulo: GC.textoCidadeTelao(fila),
        html: `${relevo()}<div class="tn-grade">${itens.join('')}</div>`,
      };
    },
  });
})(window.GC = window.GC || {});
