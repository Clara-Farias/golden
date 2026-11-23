(function (GC) {
  // Tema da Maia (IA roteirizada): obras. O motor (js/ia-roteiro.js) escolhe o tema pelas palavras-chave
  // e completa a resposta com origem, base, selo e alerta daqui.
  const { plural, camada, unicos } = GC.iaUtil;

  GC.temasIA.push({
    ordem: 40, // empate de palavras-chave: vence o menor
    id: 'obras',
    // Peso: texto vale 2; { peso: 3 } é palavra específica, { peso: 1 } genérica. inteira: só a palavra ou o plural.
    chaves: ['obra', { termo: 'paralis', peso: 3 }, { termo: 'contrato', peso: 1 }, { termo: 'empreit', peso: 3 }, 'construc'],
    // Pergunta de volta ("Você quer saber das obras ou …?") e "Você quis dizer…".
    nome: 'Obras',
    assunto: 'das obras',
    exemplo: 'Quais obras estão atrasadas?',
    disponivel: () => !!GC.obras,
    responder() {
      const r = GC.obras.resumo();
      const atrasadas = r.obras.filter((o) => o.atrasada).sort((a, b) => b.diasAtraso - a.diasAtraso);
      const par = r.paralisadas[0];
      const g = r.gastoAFrente.sort((a, b) => (b.gastoPct - b.avancoPct) - (a.gastoPct - a.avancoPct))[0];
      const alvo = par || atrasadas[0];
      return {
        texto: `${r.atrasadas} de ${r.emAndamento} obras em andamento estão atrasadas, com atraso médio de ${r.atrasoMedioDias} dias.${par ? ` ${par.nome} está parada há ${par.semAvancoDias} dias (${par.diasAtraso} dias de atraso).` : ''}${g ? ` Atenção ao pagamento: em ${plural(r.gastoAFrente.length, 'obra', 'obras')} já se pagou bem mais do que foi feito, como ${g.nome} (${g.gastoPct}% pago, ${g.avancoPct}% feito).` : ''} Do total contratado (R$ ${r.contratoMi.toLocaleString('pt-BR')} mi), ${r.gastoPct}% já foi pago.`,
        ...(atrasadas.length ? {
          grafico: { tipo: 'barra', titulo: 'Dias de atraso por obra', rotulos: atrasadas.slice(0, 8).map((o) => o.nome), series: [{ nome: 'Atraso', valores: atrasadas.slice(0, 8).map((o) => o.diasAtraso) }], unidade: 'dias' },
          mapa: { tipo: 'destaque', bairros: unicos(atrasadas.map((o) => o.bairroId)), legenda: 'Bairros com obra atrasada' },
        } : {}),
        acoes: alvo ? [camada(`Ver ${alvo.nome} no mapa`, 'obras', alvo.id)] : [],
      };
    },
    // De onde vem a resposta (fontes, secretarias e a consulta mostrada no "Ver consulta").
    origem: { areas: ['infraestrutura'], fontes: ['obras.contratos', 'obras.medicoes', 'financas.pagamentos'], consulta: 'SELECT obra, previsao_original, previsao_atual, avanco_pct, SUM(pago) / valor_contrato AS pago_pct FROM obras.contratos JOIN obras.medicoes USING (obra) JOIN financas.pagamentos USING (obra) GROUP BY obra' },
    // Base consultada: registros lidos e período (GC.baseConsultada).
    base: { periodo: 'contratos vigentes', registros: () => { const o = GC.obras.resumo ? GC.obras.resumo() : GC.obras; return (o.obras || []).length * 3; } },
    // Regra do "🔔 Transformar em alerta".
    alerta: 'obra.dias_atraso > 30 OU obra.dias_sem_avanco > 60',
  });
})(window.GC = window.GC || {});
