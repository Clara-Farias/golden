(function (GC) {
  // Maia na gaveta de Alertas (decisões; spec 2026-11-12, Maia v2, fase 5). Com a gaveta aberta, o contexto traz
  // foco: { tipo: 'decisoes', lista (store.atencao().todas) }. "Por onde começar?" separa o que pede cobrança
  // (prazo estourado), o que pede gabinete (mais de uma secretaria) e o resto, e oferece cobrar em lote.
  GC.focosIA = GC.focosIA || {};
  const ORGANIZAR = /\b(por onde comec\w*|comec\w* por|qual primeiro|o que decidir|o que fazer|prioridad\w*|organiz\w*|resum\w*|qual a mais urgente|mais urgente)\b/;
  const MAX_LOTE = 12;

  GC.focosIA.decisoes = {
    responder(foco, ent) {
      if (!Array.isArray(foco.lista) || ent.intencao || !ORGANIZAR.test(ent.q)) return null;
      const { plural, nomes, bairro } = GC.iaUtil;
      const pendentes = foco.lista.filter((o) => !(GC.tratada ? GC.tratada(o) : o.acaoPrefeito) && o.status !== 'resolvida');
      if (!pendentes.length) return { cenario: 'decisoes', texto: foco.lista.length ? 'Você já agiu em todas as exceções; agora é com as secretarias.' : 'Nada fugiu do normal agora.' };
      const acoes = (o) => (GC.acoesDisponiveis ? GC.acoesDisponiveis(o) : []);
      const cobrar = pendentes.filter((o) => acoes(o).includes('cobrar'));
      const gabinete = pendentes.filter((o) => acoes(o).includes('gabinete') && !cobrar.includes(o));
      const resto = pendentes.filter((o) => !cobrar.includes(o) && !gabinete.includes(o));
      const rotulo = (o) => `${o.titulo} (${bairro(o.bairroId).nome})`;
      const partes = [`São ${plural(pendentes.length, 'exceção esperando você', 'exceções esperando você')}.`];
      if (cobrar.length) partes.push(`${cobrar.length === 1 ? 'Uma está' : `${cobrar.length} estão`} com prazo estourado e ${cobrar.length === 1 ? 'pede' : 'pedem'} cobrança: comece por ${rotulo(cobrar[0])}.`);
      if (gabinete.length) partes.push(`${gabinete.length === 1 ? 'Uma envolve' : `${gabinete.length} envolvem`} mais de uma secretaria e pode${gabinete.length === 1 ? '' : 'm'} pedir gabinete de crise: ${nomes(gabinete.slice(0, 2).map(rotulo))}.`);
      if (resto.length) partes.push(`${resto.length === 1 ? 'A outra' : `As outras ${resto.length}`} se repete${resto.length === 1 ? '' : 'm'} no bairro e ${resto.length === 1 ? 'pode' : 'podem'} esperar a secretaria, ou ser priorizada${resto.length === 1 ? '' : 's'}.`);
      const lote = cobrar.slice(0, MAX_LOTE);
      const primeira = cobrar[0] || gabinete[0] || resto[0];
      return {
        cenario: 'decisoes',
        texto: `${partes.join(' ')}${lote.length > 1 ? ' Posso cobrar as de prazo estourado de uma vez.' : ''}`,
        acoes: [
          ...(lote.length > 1 ? [{ rotulo: `📣 Cobrar as ${lote.length} de prazo estourado`, tipo: 'agirLote', payload: { acao: 'cobrar', ocorrenciaIds: lote.map((o) => o.id) } }] : []),
          ...(lote.length === 1 ? [{ rotulo: `📣 Cobrar: ${lote[0].titulo}`, tipo: 'agir', payload: { ocorrenciaId: lote[0].id, acao: 'cobrar' } }] : []),
          { rotulo: `Ver no mapa: ${primeira.titulo}`, tipo: 'focarOcorrencia', payload: { ocorrenciaId: primeira.id } },
        ],
      };
    },
  };
})(window.GC = window.GC || {});
