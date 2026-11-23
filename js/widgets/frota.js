(function (GC) {
  // Conteúdo do widget (HTML puro, sem estado): js/widgets.js chama GC.conteudoWidget.frota(dados do painel, opções).
  const { esc } = GC.widgetUtil;

  // No catálogo (gaveta Widgets e painel padrão).
  GC.registrarWidget({ id: 'frota', ordem: 60, nome: 'Frota e linhas', emoji: '🚌', icone: 'bus', categoria: 'cidade', descricao: 'Ônibus e ambulâncias rodando, em manutenção e com preventiva vencida; espera nos pontos' });

  // Frota: ônibus (metas do contrato de concessão) e ambulâncias (SAMU) lado a lado, linhas com espera nos
  // pontos e a agenda de manutenção (vencidas, hoje, próximos dias).
  const SIT_LINHA = { critica: 'Crítica', atencao: 'Atenção', ok: 'Normal' };
  const SIT_AGENDA = { vencida: 'Vencida', hoje: 'Hoje', proxima: 'Agendada' };
  const dataCurta = (iso) => iso.slice(8, 10) + '/' + iso.slice(5, 7);
  function frota(r) {
    if (!r) return '';
    const o = r.onibus;
    const a = r.ambulancias;
    const cartao = (titulo, f, linhasExtra, id) => `<div class="w-frota-cartao">
        <h4>${titulo}${id ? ` <button type="button" class="btn-sec" data-camada="frota" data-id="${id}">📍 Ver no mapa</button>` : ''}</h4>
        <div class="w-frota-disp"><b>${f.operando}</b> de ${f.necessarios} rodando <span class="${f.disponibilidadePct >= (f.metaDisponibilidadePct || 95) ? 'bom' : 'ruim'}">${f.disponibilidadePct}% de disponibilidade</span></div>
        <ul class="w-frota-estados">
          <li><b>${f.corretiva}</b>em manutenção</li>
          <li><b>${f.preventiva}</b>em preventiva hoje</li>
          <li class="${f.preventivaVencida ? 'ruim' : ''}"><b>${f.preventivaVencida}</b>com preventiva vencida</li>
          <li><b>${f.reserva}</b>na reserva</li>
        </ul>
        ${linhasExtra}
      </div>`;
    const contrato = o.foraDoContrato
      ? `<p class="w-frota-cobrar">📣 Abaixo do contrato: disponibilidade ${o.disponibilidadePct}% (meta ${o.metaDisponibilidadePct}%) e viagens ${o.viagensPct}% (meta ${o.metaViagensPct}%). Cabe notificar a ${esc(o.operadora)}; multa estimada de R$ ${o.multaEstimadaMil} mil no mês.</p>`
      : '<p class="w-frota-ok">✅ Concessionária dentro das metas do contrato.</p>';
    const linhas = r.linhas.map((x) => `<li><button type="button" data-camada="frota" data-id="${x.id}" title="Ver o trajeto no mapa">
        <span class="sit ${x.situacao}">${SIT_LINHA[x.situacao]}</span>
        <span class="nome">${esc(x.nome)}<small>espera ${x.esperaMin} min (programado ${x.intervaloMin}) · ${x.viagensPct}% das viagens</small></span>
      </button></li>`).join('');
    const agenda = r.agenda.map((x) => `<li class="${x.situacao}"><span class="quando">${SIT_AGENDA[x.situacao]} · ${dataCurta(x.data)}</span><span>${x.frota === 'onibus' ? '🚌' : '🚑'} <b>${esc(x.veiculo)}</b> · ${esc(x.motivo)}</span></li>`).join('');
    const garagem = r.garagens[0];
    const piorBase = r.bases.slice().sort((x, y) => x.disponibilidadePct - y.disponibilidadePct)[0];
    return `<div class="w-frota">
      <div class="w-seg-colunas">
        ${cartao(`🚌 Ônibus · ${esc(o.operadora)} (concessão)`, o, `<p class="w-frota-nota">${o.viagensRealizadas.toLocaleString('pt-BR')} de ${o.viagensProgramadas.toLocaleString('pt-BR')} viagens hoje (${o.viagensPct}%) · ${o.acimaIdade} ônibus acima de ${o.idadeMaxAnos} anos (troca)</p>${contrato}`, garagem && garagem.id)}
        ${cartao('🚑 Ambulâncias · SAMU', a, `<p class="w-frota-nota">⏱ Tempo de resposta <b class="${a.tempoRespostaMin > a.metaTempoRespostaMin ? 'ruim' : 'bom'}">${a.tempoRespostaMin} min</b> (meta ${a.metaTempoRespostaMin}) · ${a.chamadosHoje} chamados hoje</p>`, piorBase && piorBase.id)}
      </div>
      <div class="w-seg-colunas w-det">
        <div><h4>Linhas · espera nos pontos</h4><ul class="w-edu-lista w-frota-linhas">${linhas}</ul></div>
        <div><h4>Agenda de manutenção</h4><ul class="w-frota-agenda">${agenda}</ul></div>
      </div>
    </div>`;
  }

  GC.conteudoWidget.frota = (d) => frota(d.frota);

  // ---- Versão pública (embed.html): só os ônibus, como o passageiro pergunta: "quanto vou esperar no ponto?".
  // Sem garagem, manutenção, metas e multa do contrato, e sem as ambulâncias (o SAMU é pelo 192).
  const { escolha, nomeBairro, listaE } = GC.widgetUtil;
  const SIT_PUB = { ok: ['Normal', 'ok'], atencao: ['Com atraso', 'atencao'], critica: ['Muito atraso', 'critica'] };
  function onibusPublico(op = {}) {
    const r = GC.frota.resumo();
    const ids = [...new Set(r.linhas.flatMap((x) => x.bairros))];
    const bairros = ids.map((id) => ({ id, nome: nomeBairro(id) })).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    const bairro = ids.includes(op.bairro) ? op.bairro : '';
    const linhas = r.linhas.filter((x) => !bairro || x.bairros.includes(bairro));
    const comAtraso = linhas.filter((x) => x.situacao !== 'ok').length;
    const itens = linhas.map((x) => {
      const [rotulo, cls] = SIT_PUB[x.situacao];
      const passa = [...new Set(x.bairros)].map(nomeBairro);
      return `<li><span class="vp-nivel ${cls}">${rotulo}</span><span><b>${esc(x.nome)}</b>
        <small>Espera nos pontos: cerca de ${x.esperaMin} min${x.esperaMin > x.intervaloMin ? ` (o normal é ${x.intervaloMin} min)` : ''}</small>
        <small>Passa por ${esc(listaE(passa))}</small></span></li>`;
    }).join('');
    return `<div class="vp-onibus">
      ${escolha('bairro', 'Seu bairro', 'Todas as linhas', bairros, bairro)}
      ${comAtraso ? `<div class="vp-faixa atencao">${GC.widgetUtil.ic('clock-exclamation')}<div><b>${comAtraso === 1 ? '1 linha com atraso agora' : `${comAtraso} linhas com atraso agora`}</b>
        <span>Saia um pouco mais cedo se for usar ${comAtraso === 1 ? 'essa linha' : 'essas linhas'}.</span></div></div>`
        : `<div class="vp-faixa ok">${GC.widgetUtil.ic('bus')}<div><b>Ônibus no horário</b><span>Todas as linhas com espera normal agora.</span></div></div>`}
      <ul class="vp-lista">${itens}</ul>
      <p class="vp-fonte">Espera média nos pontos hoje. Dúvidas sobre linhas e horários: ${esc(GC.widgetUtil.telefone())}.</p>
    </div>`;
  }
  GC.conteudoPublico.frota = {
    nome: 'Ônibus agora',
    descricao: 'Espera nos pontos de cada linha, com as linhas que passam no seu bairro',
    opcoes: [{ id: 'bairro', rotulo: 'Bairro já escolhido', valores: () => [...new Set(GC.frota.resumo().linhas.flatMap((x) => x.bairros))].map((id) => ({ id, nome: nomeBairro(id) })) }],
    montar: onibusPublico,
  };
})(window.GC = window.GC || {});
