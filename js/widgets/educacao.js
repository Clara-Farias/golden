(function (GC) {
  // Conteúdo do widget (HTML puro, sem estado): js/widgets.js chama GC.conteudoWidget.educacao(dados do painel, opções).
  const { esc, plural } = GC.widgetUtil;

  // No catálogo (gaveta Widgets e painel padrão).
  GC.registrarWidget({ id: 'educacao', ordem: 70, nome: 'Educação', emoji: '🎓', icone: 'school', categoria: 'social', descricao: 'Professores faltando, evasão, frequência, escolas e escolaridade da população' });

  // Educação: rede (alunos, professores faltando, evasão, frequência), alertas por escola, lista de escolas e
  // a escolaridade da população (alfabetização no 3º ano, 15+ alfabetizados, 25+ com ensino médio).
  const SIT_ESCOLA = { critica: 'Crítica', atencao: 'Atenção', ok: 'Em dia' };
  const pctBR = (n) => (n === null || n === undefined ? '—' : `${n.toLocaleString('pt-BR')}%`);
  function educacao(r) {
    if (!r) return '';
    const alertas = r.emAlerta.flatMap((x) => x.motivos.filter((m) => m.critico).map((m) => `<li data-camada="escolas" data-id="${x.id}">⚠ <b>${esc(x.nome)}</b>: ${esc(m.texto)}</li>`)).join('');
    const lista = r.escolas.map((x) => `<li><button type="button" data-camada="escolas" data-id="${x.id}" title="Ver no mapa">
        <span class="sit ${x.situacao}">${SIT_ESCOLA[x.situacao]}</span>
        <span class="nome">${esc(x.nome)}<small>${x.alunos} ${x.tipo === 'cmei' ? 'crianças' : 'alunos'} · ${x.alunosPorProfessor.toLocaleString('pt-BR')} por professor · freq. ${x.frequenciaPct}%${x.evasaoPct !== null ? ` · evasão ${pctBR(x.evasaoPct)}` : ''}</small></span>
        <span class="prof ${x.faltando ? 'falta' : ''}">${x.faltando ? `faltam ${x.faltando}` : 'completa'}</span>
      </button></li>`).join('');
    const piores = r.piorEscolaridade.map((b) => `<li><span>${esc(b.nome)}</span><b>${pctBR(b.ensinoMedio25)}</b></li>`).join('');
    return `<div class="w-edu">
      <div class="w-numeros">
        <div class="w-num"><b>${r.alunos.toLocaleString('pt-BR')}</b><small>alunos em ${r.escolas.length} escolas · ${r.alunosPorProfessor.toLocaleString('pt-BR')} por professor</small></div>
        <div class="w-num ${r.faltando ? 'critica' : 'bom'}"><b>${r.faltando}</b><small>professores faltando · ${r.aulasPerdidasSemana.toLocaleString('pt-BR')} aulas perdidas por semana</small></div>
        <div class="w-num ${r.evasaoPct >= GC.data.educacao.limite.evasaoAtencao ? 'alerta' : ''}"><b>${pctBR(r.evasaoPct)}</b><small>evasão no ano · ${plural(r.evasaoAlta.length, 'escola', 'escolas')} acima de ${GC.data.educacao.limite.evasaoAtencao}%</small></div>
        <div class="w-num ${r.frequenciaPct < GC.data.educacao.limite.freqAtencao ? 'alerta' : 'bom'}"><b>${pctBR(r.frequenciaPct)}</b><small>frequência média</small></div>
      </div>
      ${alertas ? `<ul class="w-obras-alertas">${alertas}</ul>` : ''}
      <div class="w-seg-colunas w-det">
        <div>
          <h4>Escolas da rede</h4>
          <ul class="w-edu-lista">${lista}</ul>
        </div>
        <div class="w-edu-escolaridade">
          <h4>Alfabetização e escolaridade</h4>
          <p><b>${pctBR(r.alfabetizacao3anoPct)}</b> das crianças alfabetizadas no 3º ano (rede)</p>
          <p><b>${pctBR(r.cidade.alfabetizados15)}</b> da população com 15 anos ou mais sabe ler e escrever</p>
          <p><b>${pctBR(r.cidade.ensinoMedio25)}</b> dos adultos (25+) concluíram o ensino médio</p>
          <h4>Menos adultos com ensino médio</h4>
          <ul class="w-vmc-bairros">${piores}</ul>
          <small>Onde EJA e cursos preparatórios fazem mais diferença.</small>
        </div>
      </div>
    </div>`;
  }

  GC.conteudoWidget.educacao = (d) => educacao(d.educacao);
})(window.GC = window.GC || {});
