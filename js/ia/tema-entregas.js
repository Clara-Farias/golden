(function (GC) {
  // Tema da Maia (IA roteirizada): agenda de entregas (js/data-entregas.js). "O que vamos entregar este mês?",
  // "o que entregamos?", "quais entregas estão em risco?". Lê sempre GC.entregas, o mesmo do widget e da tela.
  // Obra atrasada ou paralisada continua com o tema de obras (ordem 40); este vem antes (35) para "entrega".
  const { plural, normalizar, camada, nomes, unicos } = GC.iaUtil;

  const nomeArea = (id) => ((GC.data.areas || []).find((a) => a.id === id) || { nome: id }).nome;
  const nomeBairro = (id) => (id ? (GC.data.bairros.find((b) => b.id === id) || { nome: id }).nome : 'cidade inteira');
  const dia = (iso) => `${+iso.slice(8, 10)}/${iso.slice(5, 7)}`;

  // Recorte: a secretaria citada na pergunta ("da saúde"), senão o filtro de secretarias do mapa (vazio = cidade).
  // O setor nunca sai da própria pasta.
  function areasDe(ctx = {}, ent = {}) {
    const citadas = (ent.secretarias || []).filter((a) => (GC.data.areas || []).some((x) => x.id === a));
    const base = citadas.length ? citadas : ctx.area && ctx.area.length ? ctx.area : null;
    if (!(ctx.areasPerfil && ctx.areasPerfil.length)) return base;
    const dentro = (base || []).filter((a) => ctx.areasPerfil.includes(a));
    return dentro.length ? dentro : ctx.areasPerfil;
  }
  // "Na cidade", "Na Secretaria de Saúde", "Nas secretarias do recorte", e o bairro citado.
  function quemDe(areas, bairro) {
    const onde = bairro ? ` no bairro ${nomeBairro(bairro)}` : '';
    if (!areas) return bairro ? `No bairro ${nomeBairro(bairro)}` : 'Na cidade';
    if (areas.length === 1) return `Na ${GC.data.areas.find((a) => a.id === areas[0]).secretaria.nome}${onde}`;
    return `Nas secretarias do recorte${onde}`;
  }

  const PASSADO = ['entregamos', 'entregue', 'entregues', 'inauguramos', 'inaugurad', 'conclui', 'ja entreg'];
  const ATENCAO = ['risco', 'atrasad', 'parad', 'atencao', 'remarcad', 'problema'];

  function seisMeses(r) {
    const ini = r.hoje.slice(0, 7);
    const meses = Array.from({ length: 6 }, (_, k) => {
      const t = +ini.slice(0, 4) * 12 + (+ini.slice(5, 7) - 1) + k;
      return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
    });
    const abertas = r.todas.filter((e) => e.situacao !== 'entregue');
    return {
      tipo: 'barra', titulo: 'Entregas previstas por mês', unidade: 'entregas',
      rotulos: meses.map((m) => GC.entregas.CURTOS[+m.slice(5, 7) - 1]),
      series: [{ nome: 'Previstas', valores: meses.map((m) => abertas.filter((e) => e.dataAtual.slice(0, 7) === m).length) }],
    };
  }

  const abrirAgenda = () => ({ rotulo: '📦 Abrir a agenda de entregas', tipo: 'abrirTela', payload: { rota: { tela: 'entregas' } } });
  const verObra = (e) => (e && e.origem.obra ? [camada(`Ver ${e.titulo} no mapa`, 'obras', e.origem.obra)] : []);
  const comBairros = (lista, legenda) => {
    const bairros = unicos(lista.map((e) => e.bairroId).filter(Boolean));
    return bairros.length ? { mapa: { tipo: 'destaque', bairros, legenda } } : {};
  };

  function atencao(r, quem) {
    if (!r.atencao.length) return { texto: `${quem}, nenhuma entrega está parada, atrasada ou em risco agora.${r.proximas30.length ? ` Nos próximos 30 dias estão previstas ${plural(r.proximas30.length, 'entrega', 'entregas')}.` : ''}`, acoes: [] };
    const linha = (e) => `${e.titulo} (${nomeArea(e.area)}): ${GC.entregas.situacaoEmPalavras(e)}`;
    const partes = [];
    if (r.paradas.length) partes.push(`${plural(r.paradas.length, 'entrega parada', 'entregas paradas')}: ${nomes(r.paradas.map(linha))}.`);
    if (r.atrasadas.length) partes.push(`${plural(r.atrasadas.length, 'atrasada', 'atrasadas')}: ${nomes(r.atrasadas.slice(0, 4).map(linha))}${r.atrasadas.length > 4 ? ` e mais ${r.atrasadas.length - 4}` : ''}.`);
    if (r.emRisco.length) partes.push(`Em risco de atrasar, pelo ritmo: ${nomes(r.emRisco.map(linha))}.`);
    return {
      texto: `${quem}, ${plural(r.atencao.length, 'entrega precisa', 'entregas precisam')} de atenção. ${partes.join(' ')} Sugiro começar pela primeira: é a mais grave.`,
      ...comBairros(r.atencao, 'Bairros com entrega parada, atrasada ou em risco'),
      acoes: verObra(r.atencao.find((e) => e.origem.obra)),
    };
  }

  function entregues(r, quem) {
    const lista = r.entregues.slice().reverse(); // mais recente primeiro
    if (!lista.length) return { texto: `${quem}, nenhuma entrega foi concluída este ano.`, acoes: [] };
    return {
      texto: `${quem}, a prefeitura concluiu ${plural(lista.length, 'entrega', 'entregas')} este ano. As mais recentes: ${nomes(lista.slice(0, 4).map((e) => `${e.titulo} (${nomeBairro(e.bairroId)}, ${dia(e.dataAtual)})`))}.${r.proximas30.length ? ` A próxima prevista é ${r.proximas30[0].titulo}, ${GC.entregas.quando(r.proximas30[0])}.` : ''}`,
      ...comBairros(lista, 'Bairros com entrega concluída este ano'),
      acoes: [],
    };
  }

  // dias: 30 (padrão) ou 7 ("esta semana").
  function proximas(r, quem, dias = 30) {
    const lista = dias === 30 ? r.proximas30 : r.proximas30.filter((e) => e.diasParaEntrega <= dias);
    const janela = dias === 30 ? 'Nos próximos 30 dias' : 'Nos próximos 7 dias';
    const at = r.atencao.length ? ` ${plural(r.atencao.length, 'entrega precisa', 'entregas precisam')} de atenção (${[r.paradas.length && plural(r.paradas.length, 'parada', 'paradas'), r.atrasadas.length && plural(r.atrasadas.length, 'atrasada', 'atrasadas'), r.emRisco.length && `${r.emRisco.length} em risco`].filter(Boolean).join(', ')}).` : '';
    const texto = lista.length
      ? `${quem}, ${janela.toLowerCase()} ${lista.length === 1 ? 'está prevista 1 entrega' : `estão previstas ${lista.length} entregas`}: ${nomes(lista.map((e) => `${e.titulo} (${dia(e.dataAtual)}${e.situacao === 'no_prazo' ? '' : `, ${GC.entregas.rotulo(e).toLowerCase()}`})`))}.${at} Este ano já foram concluídas ${r.entregues.length}.`
      : `${quem}, nenhuma entrega está prevista ${janela.toLowerCase().replace('nos ', 'para os ')}.${at} Este ano já foram concluídas ${r.entregues.length}.`;
    return {
      texto,
      grafico: seisMeses(r),
      ...comBairros(lista, `Bairros com entrega prevista em ${dias} dias`),
      acoes: verObra(lista.find((e) => e.origem.obra && e.situacao !== 'no_prazo') || r.atencao.find((e) => e.origem.obra)),
    };
  }

  GC.temasIA.push({
    ordem: 35, // empate de palavras-chave: vence o menor (obras, 40, fica com "obra atrasada" e "paralisada")
    id: 'entregas',
    chaves: [{ termo: 'entrega', peso: 3 }, { termo: 'entregar', peso: 3 }, { termo: 'entregamos', peso: 3 }, { termo: 'inaugur', peso: 3 },
      { termo: 'agenda de entregas', peso: 3 }, { termo: 'vem ai', peso: 1 }],
    nome: 'Agenda de entregas',
    assunto: 'das entregas da prefeitura',
    exemplo: 'O que vamos entregar nos próximos 30 dias?',
    disponivel: () => !!GC.entregas,
    // "este ano" e "esta semana" já saem separados (entregues no ano; previstas em 7 dias).
    periodos: ['ano', 'semana'],
    // O bairro citado já recorta a agenda: sem a frase de casos de 30 dias que o motor põe na frente.
    entendeBairro: true,
    responder(ctx, pergunta, ent = {}) {
      const areas = areasDe(ctx, ent);
      const bairro = (ent.bairros || []).length === 1 ? ent.bairros[0] : null;
      const r = GC.entregas.resumo({ areas, bairro });
      const quem = quemDe(areas, bairro);
      const q = normalizar(pergunta || '');
      const resp = ATENCAO.some((p) => q.includes(p)) ? atencao(r, quem)
        : PASSADO.some((p) => q.includes(p)) ? entregues(r, quem)
          : proximas(r, quem, ent.periodo && ent.periodo.id === 'semana' ? 7 : 30);
      resp.acoes = [...(resp.acoes || []), abrirAgenda()];
      return resp;
    },
    origem: { areas: ['infraestrutura', 'saude', 'educacao', 'mobilidade', 'defesa_civil', 'limpeza', 'seguranca'], fontes: ['obras.contratos', 'obras.medicoes', 'plano_governo.metas', 'gabinete.entregas'], consulta: 'SELECT entrega, secretaria, bairro, data_original, data_atual, avanco_pct, situacao FROM gabinete.entregas LEFT JOIN obras.medicoes USING (obra) ORDER BY data_atual' },
    base: { periodo: 'entregas do ano e previstas', registros: () => GC.entregas.lista().length },
    selo: 'analise',
    alerta: `obra.avanco_pct < esperado_pelo_tempo - ${GC.entregas ? GC.entregas.LIMITE_RISCO_PP : 15} OU entrega.data_atual > entrega.data_original`,
  });
})(window.GC = window.GC || {});
