(function (GC) {
  // Telão · gabinete de crise ativo: abre cada volta enquanto houver um, antes dos números. Só leitura:
  // o andamento das tarefas por secretaria, há quanto tempo está aberto e a câmera na ocorrência de origem.
  // Com vários gabinetes, um por volta, em rodízio. Sem gabinete ativo, a cena é pulada.
  // dados.gabinetes: os resumos de GC.criarGabinetes().resumo(id) (js/crise.js).
  const MAX = 5;
  const esc = (t) => GC.escaparHtml(String(t));
  // Nome curto da área (Saúde), não o da secretaria (Secretaria de Saúde): cabe na coluna sem cortar.
  const nomeArea = (t) => { const a = ((GC.data && GC.data.areas) || []).find((x) => x.id === t.area); return a ? a.nome : (t.secretaria ? t.secretaria.nome : t.area); };
  const ORDEM = { em_andamento: 0, a_fazer: 0, concluida: 2, cancelada: 3 };

  function situacao(t) {
    if (t.status === 'concluida') return '<span class="tcr-sit feita"><i class="ti ti-circle-check" aria-hidden="true"></i> concluída</span>';
    if (t.atrasada) return `<span class="tcr-sit atrasada">atrasada há ${esc(GC.tempoTexto(-t.restanteMin))}</span>`;
    const quando = `prazo em ${esc(GC.tempoTexto(Math.max(0, t.restanteMin)))}`;
    return `<span class="tcr-sit">${t.status === 'em_andamento' ? 'em andamento · ' : ''}${quando}</span>`;
  }

  GC.cenasTelao = GC.cenasTelao || [];
  GC.cenasTelao.push({
    id: 'crise',
    ordem: 5,
    nome: 'Gabinete de crise',
    descricao: 'Enquanto houver gabinete ativo, abre cada volta com o andamento das demandas',
    abertura: true,
    fixa: true,
    disponivel: (dados) => !!(dados.gabinetes && dados.gabinetes.length),
    montar({ dados, memoria }) {
      const lista = dados.gabinetes || [];
      if (!lista.length) return null;
      const i = (memoria.i || 0) % lista.length;
      memoria.i = i + 1;
      const r = lista[i];
      const g = r.gabinete;
      // Pendentes e atrasadas primeiro (as atrasadas no topo); canceladas ficam de fora.
      const tarefas = r.tarefas.filter((t) => t.status !== 'cancelada')
        .sort((a, b) => (ORDEM[a.status] - ORDEM[b.status]) || (b.atrasada - a.atrasada) || (a.restanteMin - b.restanteMin));
      const linhas = tarefas.slice(0, MAX).map((t) => `<li class="${t.status === 'concluida' ? 'feita' : t.atrasada ? 'atrasada' : ''}">`
        + `<span class="tcr-quem">${esc(nomeArea(t))}</span><span class="tcr-texto">${esc(t.texto)}</span>${situacao(t)}</li>`).join('');
      const resto = tarefas.length - MAX;
      const sub = [r.bairro, `aberto há ${GC.tempoTexto(r.abertoHaMin)}`, lista.length > 1 ? `${i + 1} de ${lista.length} gabinetes` : ''].filter(Boolean).join(' · ');
      return {
        rotulo: 'Gabinete de crise',
        sub,
        titulo: g.titulo,
        foco: g.ocorrenciaId || null,
        html: `<div class="tcr-progresso"><span class="tcr-barra" style="--v:${r.pct}%" aria-hidden="true"><i></i></span>`
          + `<b>${r.feitas} de ${r.total} demandas concluídas</b>${r.atrasadas ? `<em>${r.atrasadas} ${r.atrasadas === 1 ? 'atrasada' : 'atrasadas'}</em>` : ''}</div>`
          + `<ul class="tcr-lista">${linhas}</ul>${resto > 0 ? `<div class="tc-seguir">e mais ${resto} ${resto === 1 ? 'demanda' : 'demandas'}</div>` : ''}`,
      };
    },
  });
})(window.GC = window.GC || {});
