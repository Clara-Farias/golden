(function (GC) {
  // Maia nos relatórios (spec 2026-11-12, Maia v2, fase 5). Na tela Relatórios, o contexto traz
  // foco: { tipo: 'relatorio', rel (GC.montarRelatorio) }. "Resuma este relatório" lê os tópicos, os números
  // do painel e o que fazer primeiro. Pergunta de outro assunto devolve null e segue para os temas.
  GC.focosIA = GC.focosIA || {};
  const LEITURA = /\b(resum\w*|destaque\w*|principa\w*|o que (diz|mostra)|deste relatorio|este relatorio|esse relatorio|relatorio|conclus\w*|leitura|recomend\w*|o que fazer|explique|explica)\b/;

  GC.focosIA.relatorio = {
    responder(foco, ent) {
      const rel = foco.rel;
      if (!rel || !LEITURA.test(ent.q) || ent.intencao) return null;
      const painel = rel.painel || {};
      const numeros = (painel.kpis || []).slice(0, 3).map((k) => `${k.rotulo.toLowerCase()}: ${k.valor}${k.tendencia && k.tendencia.texto ? ` (${k.tendencia.texto})` : ''}`);
      const fazer = painel.esquerda && painel.esquerda.titulo === 'O que fazer agora' ? (painel.esquerda.itens || []).map((i) => i.texto) : [];
      const recs = ((rel.secoes || []).find((s) => s.titulo === 'Recomendações') || {}).itens || [];
      const primeiro = fazer[0] || recs[0];
      const texto = `${rel.titulo}, ${rel.periodo && rel.periodo.rotulo ? rel.periodo.rotulo : 'período escolhido'}. ${(rel.topicos || []).slice(0, 3).join(' ')}`
        + `${numeros.length ? ` No painel, ${GC.iaUtil.nomes(numeros)}.` : ''}`
        + `${primeiro ? ` O que fazer primeiro: ${primeiro.charAt(0).toLowerCase()}${primeiro.slice(1).replace(/\.$/, '')}.` : ''}`;
      // Relatório de uma secretaria: o próximo passo natural é o ofício de cobrança.
      const sec = rel.tipo === 'secretaria' && (GC.data.areas || []).find((a) => a.id === rel.alvo);
      return {
        cenario: 'relatorio',
        texto,
        ...(rel.fontes && rel.fontes.length ? { fontes: rel.fontes.slice(0, 8) } : {}),
        acoes: sec ? [{ rotulo: `Ofício para a ${sec.nome}`, tipo: 'perguntar', payload: { texto: `Escreva um ofício cobrando a ${sec.nome}` } }] : [],
      };
    },
  };
})(window.GC = window.GC || {});
