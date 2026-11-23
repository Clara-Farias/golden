(function (GC) {
  // Tema da Maia (IA roteirizada): medicamentos. O motor (js/ia-roteiro.js) escolhe o tema pelas palavras-chave
  // e completa a resposta com origem, base, selo e alerta daqui.
  const { plural, camada, unicos, nomes } = GC.iaUtil;

  GC.temasIA.push({
    ordem: 60, // empate de palavras-chave: vence o menor
    // Antes de "saude" (que também casa com "medic"): estoque é tema próprio.
    id: 'medicamentos',
    // Peso: texto vale 2; { peso: 3 } é palavra específica, { peso: 1 } genérica. inteira: só a palavra ou o plural.
    chaves: [{ termo: 'medicament', peso: 3 }, { termo: 'remedio', peso: 3 }, { termo: 'estoque', peso: 1 }, 'farmacia', { termo: 'insulina', peso: 3 }, 'ruptura', { termo: 'falta de remed', peso: 3 }, { termo: 'paracetamol', peso: 3 }, { termo: 'losartana', peso: 3 }],
    // Pergunta de volta ("Você quer saber dos medicamentos nas farmácias ou …?") e "Você quis dizer…".
    nome: 'Medicamentos',
    assunto: 'dos medicamentos nas farmácias',
    exemplo: 'Vai faltar algum medicamento?',
    disponivel: () => !!GC.medicamentos,
    responder() {
      const r = GC.medicamentos.resumo();
      const n = (v) => v.toLocaleString('pt-BR');
      const faltas = r.farmacias.flatMap((f) => f.rupturas.map((x) => `${x.nome} na ${f.nome}`));
      const prev = r.vaoFaltar.map((x) => `${x.nome} (~${Math.floor(x.dias)} dias${x.motivoIA ? `, ${x.motivoIA}` : ''}${x.pedido ? `; o pedido só chega em ${x.chegaEmDias} dias` : ''})`);
      const rem = r.remanejamentos[0];
      const alvo = r.ubsComRuptura[0];
      return {
        texto: `${r.rupturas ? `Hoje faltam ${r.rupturas} itens nas UBS: ${nomes(faltas)}.` : 'Nenhuma UBS está com item em falta.'}${prev.length ? ` Pela previsão da IA, vão faltar na rede antes da reposição: ${nomes(prev)}.` : ''}${rem ? ` Antes de comprar, dá para remanejar ${n(rem.qtd)} de ${rem.medicamento} da ${rem.de} para a ${rem.para}${r.remanejamentos.length > 1 ? ` (e mais ${plural(r.remanejamentos.length - 1, 'remanejamento', 'remanejamentos')})` : ''}.` : ''}${r.compras.length ? ` Compra sugerida: ${nomes(r.compras.slice(0, 3).map((x) => `${n(x.compraSugerida)} de ${x.nome}`))}.` : ''}`,
        grafico: { tipo: 'barra', titulo: 'Dias de estoque na rede (consumo previsto)', rotulos: r.itens.map((x) => x.nome), series: [{ nome: 'Dias', valores: r.itens.map((x) => Math.floor(x.dias)) }], unidade: 'dias' },
        ...(r.ubsComRuptura.length ? { mapa: { tipo: 'destaque', bairros: unicos(r.ubsComRuptura.map((f) => f.bairroId)), legenda: 'Bairros com UBS sem algum medicamento' } } : {}),
        acoes: alvo ? [camada(`Ver a farmácia da ${alvo.nome} no mapa`, 'farmacias', alvo.id)] : [camada('Ver as farmácias no mapa', 'farmacias')],
      };
    },
    // De onde vem a resposta (fontes, secretarias e a consulta mostrada no "Ver consulta").
    origem: { areas: ['saude'], fontes: ['saude.estoque_caf', 'saude.dispensacao_ubs', 'saude.pedidos_compra'], consulta: 'SELECT item, unidade, estoque, consumo_medio_dia, estoque / consumo_medio_dia AS dias FROM saude.estoque_caf UNION ALL SELECT item, ubs, estoque, consumo_medio_dia, estoque / consumo_medio_dia FROM saude.dispensacao_ubs ORDER BY dias' },
    // Base consultada: registros lidos e período (GC.baseConsultada).
    base: { periodo: 'estoque de hoje', registros: () => { const m = GC.medicamentos.resumo(); return m.itens.length * (m.farmacias.length + 1); } },
    // Regra do "🔔 Transformar em alerta".
    alerta: 'estoque_ubs = 0 OU dias_cobertura_previstos < prazo_reposicao',
  });
})(window.GC = window.GC || {});
