(function (GC) {
  // Tema da Maia (IA roteirizada): Vigilância em Saúde (js/data-vigilancia.js). Cobertura vacinal, LIRAa e
  // casos de dengue, zoonoses. A pergunta decide o recorte: vacina, zoonoses ou dengue (o padrão).
  // "Dengue" sozinha vale 2: com "temporada" ou "o que preparar", quem responde é o calendário sazonal.
  const { plural, normalizar, camada, unicos, pct, nomes, minuscula } = GC.iaUtil;

  const fala = (n) => Number(n).toLocaleString('pt-BR');
  const ZOONOSE = /zoonos|escorpi|morcego|raiva|leishman|(^|[^a-z])(caes?|cachorros?)([^a-z]|$)/;
  const VACINA = /vacin|imuniz/;

  function vacina(r) {
    const c = r.cidade;
    const abaixo = r.abaixoMeta;
    const pior = abaixo[0];
    const comAedes = pior && pior.nivelLiraa === 'risco' ? `, que também está com o LIRAa em risco (${pct(pior.liraa)})` : '';
    const ord = r.bairros.slice().sort((a, z) => a.coberturaInfantil - z.coberturaInfantil);
    return {
      texto: `A cobertura das vacinas do calendário infantil está em ${c.coberturaInfantil}% na cidade, ${c.coberturaInfantil < r.meta.infantil ? 'abaixo' : 'dentro'} da meta de ${r.meta.infantil}%. ${abaixo.length ? `${plural(abaixo.length, 'bairro está abaixo', 'bairros estão abaixo')}: ${nomes(abaixo.map((x) => `${x.nome} (${x.coberturaInfantil}%)`))}. O ponto de atenção é ${pior.nome}${comAedes}.` : 'Todos os bairros batem a meta.'} Entre os idosos, a vacina da gripe chegou a ${c.gripe60}%, meta de ${r.meta.gripe60}%. Sugiro levar a vacinação às escolas e fazer busca ativa nos bairros abaixo da meta.`,
      grafico: { tipo: 'barra', titulo: 'Cobertura vacinal infantil por bairro', rotulos: ord.map((x) => x.nome), series: [{ nome: 'Cobertura', valores: ord.map((x) => x.coberturaInfantil) }], unidade: '%' },
      ...(abaixo.length ? { mapa: { tipo: 'destaque', bairros: abaixo.map((x) => x.id), legenda: `Vacinação infantil abaixo de ${r.meta.infantil}%` } } : {}),
      acoes: [camada('Ver a vigilância no mapa', 'vigilancia')],
    };
  }

  function zoonoses(r) {
    const abertas = r.zoonoses.filter((p) => p.situacao === 'aberta');
    const campo = r.zoonoses.filter((p) => p.situacao === 'em_campo');
    const alvo = abertas[0] || campo[0];
    const lugar = (p) => `${minuscula(p.nome)} (${GC.iaUtil.bairro(p.bairroId).nome})`;
    return {
      texto: `${r.zoonosesAbertas.length ? `Há ${plural(r.zoonosesAbertas.length, 'chamado de zoonoses aberto', 'chamados de zoonoses abertos')}.` : 'Não há chamado de zoonoses aberto.'}${abertas.length ? ` ${abertas.length === 1 ? 'Espera' : 'Esperam'} equipe: ${nomes(abertas.map(lugar))}.` : ''}${campo.length ? ` Com equipe em campo: ${nomes(campo.map(lugar))}.` : ''}${alvo ? ` O mais urgente é ${lugar(alvo)}. ${alvo.nota}.` : ''} Sugiro mandar a equipe do Controle de Zoonoses primeiro onde há risco de raiva.`,
      acoes: alvo ? [camada(`Ver ${alvo.nome} no mapa`, 'vigilancia', alvo.id)] : [camada('Ver a vigilância no mapa', 'vigilancia')],
    };
  }

  function dengue(r) {
    const c = r.cidade;
    const risco = r.liraaRisco;
    const acima = r.casosAcimaDaMedia;
    const foco = r.focos[0];
    return {
      texto: `O ${r.ciclo.nome} deu ${pct(c.liraa)} na cidade, nível de ${c.nivelLiraa === 'satisfatorio' ? 'satisfatório' : c.nivelLiraa}. ${risco.length ? `${plural(risco.length, 'bairro está', 'bairros estão')} em risco (4% ou mais dos imóveis com larva): ${nomes(risco.map((x) => `${x.nome} (${pct(x.liraa)})`))}.` : 'Nenhum bairro está em risco.'} Nos últimos 7 dias foram ${c.casosSemana} casos suspeitos de dengue, ${c.variacaoPct >= 0 ? `${c.variacaoPct}% a mais` : `${-c.variacaoPct}% a menos`} que na semana anterior${acima.length ? `; ${nomes(acima.map((x) => `${x.nome} teve ${x.casosSemana}, ${fala(x.razao)} vezes a média para a época`))}` : ''}. ${r.focos.length ? `${plural(r.focos.length, 'ponto estratégico está', 'pontos estratégicos estão')} com foco ativo, sem tratamento: ${nomes(r.focos.map((p) => p.nome))}.` : ''} Sugiro mutirão casa a casa${risco.length ? ` em ${nomes(risco.map((x) => x.nome))}` : ''}${foco ? ` e tratar primeiro a ${foco.nome}` : ''}.`,
      grafico: { tipo: 'barra', titulo: `LIRAa por bairro (${r.ciclo.nome})`, rotulos: r.bairros.map((x) => x.nome), series: [{ nome: 'Imóveis com larva', valores: r.bairros.map((x) => x.liraa) }], unidade: '%' },
      ...(risco.length || acima.length ? { mapa: { tipo: 'destaque', bairros: unicos([...risco, ...acima].map((x) => x.id)), legenda: 'LIRAa em risco ou casos acima do dobro da média' } } : {}),
      acoes: foco ? [camada(`Ver ${foco.nome} no mapa`, 'vigilancia', foco.id)] : [camada('Ver a vigilância no mapa', 'vigilancia')],
    };
  }

  GC.temasIA.push({
    ordem: 105, // empate de palavras-chave: vence o menor (depois das UBS, 100, e antes da segurança, 110)
    id: 'vigilancia',
    // Peso: texto vale 2; { peso: 3 } é palavra específica, { peso: 1 } genérica. inteira: só a palavra ou o plural.
    chaves: [{ termo: 'vigilancia', peso: 3 }, { termo: 'liraa', peso: 3 }, { termo: 'aedes', peso: 3 }, { termo: 'infestac', peso: 3 },
      { termo: 'cobertura vacinal', peso: 4 }, { termo: 'vacina', peso: 2 }, { termo: 'imuniza', peso: 3 },
      { termo: 'dengue', peso: 2 }, { termo: 'mosquito', peso: 2 }, { termo: 'larva', peso: 3 },
      { termo: 'zoonos', peso: 3 }, { termo: 'escorpi', peso: 3 }, { termo: 'morcego', peso: 3 }, { termo: 'leishman', peso: 3 }, { termo: 'raiva', peso: 3, inteira: true }],
    // Palavras que pedem outro assunto: tiram este tema (a não ser que ele tenha casado uma chave de peso 3).
    exclui: ['temporada', 'proximos meses', 'epoca do ano', 'o que preparar', 'medicament', 'remedio'],
    // Pergunta de volta ("Você quer saber da vacinação, da dengue e das zoonoses ou …?") e "Você quis dizer…".
    nome: 'Vigilância em Saúde',
    assunto: 'da vacinação, da dengue e das zoonoses',
    exemplo: 'Onde o LIRAa da dengue está em risco?',
    disponivel: () => !!GC.vigilancia,
    responder(ctx, pergunta) {
      const r = GC.vigilancia.resumo();
      const q = normalizar(pergunta || '');
      if (ZOONOSE.test(q)) return zoonoses(r);
      if (VACINA.test(q)) return vacina(r);
      return dengue(r);
    },
    // De onde vem a resposta (fontes, secretarias e a consulta mostrada no "Ver consulta").
    origem: { areas: ['saude'], fontes: ['saude.liraa', 'saude.sinan_notificacoes', 'saude.si_pni', 'saude.zoonoses_chamados', 'planejamento.bairros'], consulta: 'SELECT bairro, liraa_pct, cobertura_infantil_pct, COUNT(n.id) AS casos_7d FROM saude.liraa JOIN saude.si_pni USING (bairro) LEFT JOIN saude.sinan_notificacoes n ON n.bairro = bairro AND n.agravo = \'dengue\' AND n.data >= hoje() - 7 WHERE ciclo = ultimo_ciclo() GROUP BY bairro' },
    // Base consultada: registros lidos e período (GC.baseConsultada).
    base: { periodo: 'últimas 4 semanas + último LIRAa', registros: () => { const r = GC.vigilancia.resumo(); return r.ciclo.imoveis + r.cidade.semanas.reduce((s, n) => s + n, 0) + r.pontos.length; } },
    // Regra do "🔔 Transformar em alerta".
    alerta: 'liraa_bairro >= 4% OU casos_dengue_7d > 2 × média sazonal',
  });
})(window.GC = window.GC || {});
