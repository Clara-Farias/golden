(function (GC) {
  // Tema da Maia (IA roteirizada): social. O motor (js/ia-roteiro.js) escolhe o tema pelas palavras-chave
  // e completa a resposta com origem, base, selo e alerta daqui.
  const { bairro, pct, nomes } = GC.iaUtil;

  GC.temasIA.push({
    ordem: 10, // empate de palavras-chave: vence o menor
    // CadÚnico × Saúde × Escola. Primeiro da lista: "crianças faltando à consulta e à escola" empata com
    // educação e violência, e o tema é este. Só números por bairro (a lista nominal fica com o CRAS e a UBS).
    id: 'social',
    // Peso: texto vale 2; { peso: 3 } é palavra específica, { peso: 1 } genérica. inteira: só a palavra ou o plural.
    chaves: [{ termo: 'cadunico', peso: 3 }, { termo: 'cad unico', peso: 3 }, { termo: 'vulnerav', peso: 3 }, { termo: 'busca ativa', peso: 3 }, { termo: 'bolsa familia', peso: 3 }, { termo: 'assistencia social', peso: 3 }, { termo: 'cras', peso: 3, inteira: true }, 'lembrete', 'whatsapp', { termo: 'consulta', peso: 3 }, 'pobreza'],
    // Pergunta de volta ("Você quer saber da assistência social ou …?") e "Você quis dizer…".
    nome: 'Assistência social',
    assunto: 'da assistência social',
    exemplo: 'Quem está na busca ativa do CadÚnico?',
    disponivel: () => !!GC.social,
    responder() {
      const r = GC.social.resumo();
      const e = r.efeitoLembrete;
      const n = (v) => v.toLocaleString('pt-BR');
      const alvo = (r.criticos.length ? r.criticos : r.bairros).slice(0, 3);
      return {
        texto: `${n(r.faltando)} famílias vulneráveis do CadÚnico faltaram a 2 ou mais consultas nos últimos 90 dias (${pct(r.faltandoPct)} das ${n(r.vulneraveis)}), e ${n(r.criancas)} crianças faltam à consulta e também à escola: são a lista de busca ativa. Os lembretes por WhatsApp derrubaram as faltas da cidade de ${pct(e.geralAntes)} para ${pct(e.geralDepois)}, mas nas famílias vulneráveis só de ${pct(e.vulneraveisAntes)} para ${pct(e.vulneraveisDepois)}: ${n(r.semLembrete)} das que faltam não têm celular atualizado no cadastro. Onde agir primeiro: ${nomes(alvo.map((b) => `${b.nome} (${pct(b.taxaPct)})`))}. Sugiro uma busca ativa do agente comunitário de saúde com o CRAS e atualizar o telefone no CadÚnico.`,
        grafico: { tipo: 'linha', titulo: 'Faltas em consultas: cidade × famílias vulneráveis', rotulos: r.serie.rotulos, series: [{ nome: 'Cidade', valores: r.serie.geral }, { nome: 'Famílias vulneráveis', valores: r.serie.vulneraveis }], unidade: '%' },
        mapa: { tipo: 'destaque', bairros: alvo.map((b) => b.id), legenda: 'Bairros com mais famílias vulneráveis faltando a consultas' },
      };
    },
    // De onde vem a resposta (fontes, secretarias e a consulta mostrada no "Ver consulta").
    origem: { areas: ['saude'], fontes: ['assistencia.cadunico_bairro', 'saude.agenda_ubs', 'educacao.frequencia'], consulta: "SELECT f.bairro, COUNT(DISTINCT f.familia) AS familias_faltando, COUNT(DISTINCT c.crianca) FILTER (WHERE c.frequencia_pct < 75) AS criancas_busca_ativa FROM assistencia.cadunico f JOIN saude.agenda_ubs a ON a.familia = f.familia AND a.situacao = 'falta' AND a.data >= hoje() - 90 LEFT JOIN educacao.frequencia c ON c.familia = f.familia WHERE f.renda_per_capita <= salario_minimo() / 2 GROUP BY f.bairro HAVING COUNT(a.*) >= 2 ORDER BY 2 DESC" },
    // Base consultada: registros lidos e período (GC.baseConsultada).
    base: { periodo: 'últimos 90 dias', registros: () => GC.social.resumo().familias },
    selo: 'analise',
    // Regra do "🔔 Transformar em alerta".
    alerta: 'familias_vulneraveis_com_2_faltas_90d_bairro > média_cidade × 1,15 OU crianca_falta_consulta_e_escola',
  });
})(window.GC = window.GC || {});
