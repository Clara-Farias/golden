(function (GC) {
  // Tema da Maia (IA roteirizada): manutenção de prédios públicos. O motor (js/ia-roteiro.js) escolhe o tema
  // pelas palavras-chave e completa a resposta com origem, base, selo e alerta daqui.
  // As chaves são do prédio (telhado, ar-condicionado, vistoria), não da escola nem da UBS: "escola com telhado
  // vazando" vem para cá (telhado é específico), "frequência nas escolas" continua na Educação.
  const { plural, camada, unicos, nomes, minuscula } = GC.iaUtil;
  const dias = (n) => `${n} ${n === 1 ? 'dia' : 'dias'}`;
  const dataBR = (iso) => iso.split('-').reverse().join('/');
  // "laudo elétrico" no meio da frase; sigla (AVCB) fica como está.
  const nomeVis = (n) => (/^[A-Z]{2}/.test(n) ? n : minuscula(n));

  GC.temasIA.push({
    ordem: 45, // empate de palavras-chave: vence o menor (depois de obras, 40)
    id: 'predios',
    // Peso: texto vale 2; { peso: 3 } é palavra específica, { peso: 1 } genérica. inteira: só a palavra ou o plural.
    chaves: [{ termo: 'predio', peso: 3 }, { termo: 'telhado', peso: 3 }, { termo: 'goteira', peso: 3 }, { termo: 'infiltra', peso: 3 },
      { termo: 'vazando', peso: 3 }, { termo: 'ar-condicionado', peso: 3 }, { termo: 'ar condicionado', peso: 3 }, { termo: 'vistoria', peso: 3 },
      { termo: 'avcb', peso: 3, inteira: true }, { termo: 'laudo', peso: 3 }, { termo: 'para-raio', peso: 3 }, { termo: 'para raio', peso: 3 },
      { termo: 'spda', peso: 3, inteira: true }, { termo: "caixa d'agua", peso: 3 }, { termo: 'caixa dagua', peso: 3 },
      { termo: 'acessibilidade', peso: 3 }, { termo: 'manutencao predial', peso: 4 }, { termo: 'chamados de manutencao', peso: 4 }],
    // Pergunta de volta ("Você quer saber da manutenção dos prédios ou …?") e "Você quis dizer…".
    nome: 'Manutenção de prédios',
    assunto: 'da manutenção dos prédios públicos',
    exemplo: 'Quais prédios estão com vistoria vencida?',
    disponivel: () => !!GC.predios,
    responder(ctx, q = '') {
      const r = GC.predios.resumo();
      // Recorte pela pergunta: escola (Educação), UBS e hospitais (Saúde) ou só as vistorias.
      const pasta = /(^|[^a-z])(escola|creche|cmei)/.test(q) ? 'educacao' : /(^|[^a-z])(ubs|saude|hospita|upa|posto)/.test(q) ? 'saude' : null;
      const soVistoria = /(^|[^a-z])(vistoria|avcb|laudo|para.raio|spda|bombeiro)/.test(q);
      const daPasta = (x) => !pasta || x.pastaUsuaria === pasta;
      const predios = r.predios.filter(daPasta);
      const chamados = r.chamados.filter(daPasta);
      const graves = chamados.filter((x) => x.gravidade === 'alta');
      const atrasados = chamados.filter((x) => x.atrasado);
      const ids = new Set(predios.map((p) => p.id));
      const vencidas = r.vistoriasVencidas.filter((v) => ids.has(v.predioId));
      const aVencer = r.vistoriasAVencer.filter((v) => ids.has(v.predioId));
      const criticos = predios.filter((p) => p.situacao === 'critica');
      const onde = pasta === 'educacao' ? ' nas escolas' : pasta === 'saude' ? ' nas unidades de saúde' : '';

      const linhaVistorias = vencidas.length
        ? `${plural(vencidas.length, 'vistoria vencida', 'vistorias vencidas')}: ${nomes(vencidas.map((v) => `${v.predioNome} (${nomeVis(v.nome)}, desde ${dataBR(v.validade)})`))}.`
        : 'Nenhuma vistoria vencida.';
      const linhaAVencer = aVencer.length ? ` Vencem nos próximos 30 dias: ${nomes(aVencer.map((v) => `${v.predioNome} (${nomeVis(v.nome)}, em ${dias(v.faltamDias)})`))}.` : '';
      const linhaChamados = chamados.length
        ? `${plural(chamados.length, 'chamado de manutenção aberto', 'chamados de manutenção abertos')}${onde}, ${graves.length} de gravidade alta${atrasados.length ? ` e ${atrasados.length} fora do prazo` : ''}.${graves.length ? ` Os graves: ${nomes(graves.map((x) => `${x.predioNome} (${minuscula(x.titulo)}, há ${dias(x.diasAberto)})`))}.` : ''}`
        : `Nenhum chamado de manutenção aberto${onde}.`;
      const texto = soVistoria
        ? `${linhaVistorias}${linhaAVencer} Sem AVCB em dia o prédio fica sem a licença dos bombeiros: a renovação é da Infraestrutura. ${linhaChamados}`
        : `${linhaChamados} ${linhaVistorias}${linhaAVencer}${criticos.length ? ` ${plural(criticos.length, 'prédio está', 'prédios estão')} em situação crítica.` : ''}`;

      // Alvo do "Ver no mapa": o primeiro grave (ou a vistoria vencida, se a pergunta é de vistoria).
      const alvo = soVistoria ? (vencidas[0] && predios.find((p) => p.id === vencidas[0].predioId)) || criticos[0] : criticos[0];
      const tipos = Object.entries(GC.data.predios.tiposChamado);
      const porTipo = tipos.map(([id]) => chamados.filter((x) => x.tipo === id).length);
      const bairros = unicos(criticos.map((p) => p.bairroId));
      return {
        texto: texto.trim(),
        ...(chamados.length ? { grafico: { tipo: 'barra', titulo: `Chamados de manutenção abertos${onde}, por tipo`, rotulos: tipos.map(([, nome]) => nome), series: [{ nome: 'Chamados', valores: porTipo }], unidade: 'chamados' } } : {}),
        ...(bairros.length ? { mapa: { tipo: 'destaque', bairros, legenda: 'Bairros com prédio público em situação crítica' } } : {}),
        acoes: alvo ? [camada(`Ver ${alvo.nome} no mapa`, 'predios', alvo.id)] : [],
      };
    },
    // De onde vem a resposta (fontes, secretarias e a consulta mostrada no "Ver consulta").
    origem: { areas: ['infraestrutura'], fontes: ['infraestrutura.chamados_manutencao', 'infraestrutura.vistorias_predios', 'patrimonio.predios'], consulta: "SELECT p.predio, p.pasta_usuaria, c.tipo, c.gravidade, CURRENT_DATE - c.aberto_em AS dias_aberto, v.tipo AS vistoria, v.validade FROM patrimonio.predios p LEFT JOIN infraestrutura.chamados_manutencao c ON c.predio = p.predio AND c.status = 'aberto' LEFT JOIN infraestrutura.vistorias_predios v ON v.predio = p.predio ORDER BY c.gravidade, dias_aberto DESC" },
    // Base consultada: registros lidos e período (GC.baseConsultada).
    base: { periodo: 'chamados abertos e vistorias vigentes', registros: () => { const r = GC.predios.resumo(); return r.predios.length + r.chamados.length + r.predios.length * Object.keys(GC.data.predios.vistorias).length; } },
    // Regra do "🔔 Transformar em alerta".
    alerta: 'vistoria.dias_para_vencer < 0 OU chamado.gravidade = alta E chamado.dias_aberto > prazo',
  });
})(window.GC = window.GC || {});
