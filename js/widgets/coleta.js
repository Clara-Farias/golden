(function (GC) {
  // Conteúdo do widget (HTML puro, sem estado): js/widgets.js chama GC.conteudoWidget.coleta(dados do painel, opções).
  const { esc } = GC.widgetUtil;

  // No catálogo (gaveta Widgets e painel padrão).
  GC.registrarWidget({ id: 'coleta', ordem: 50, nome: 'Coleta de lixo', emoji: '🚛', icone: 'truck', categoria: 'cidade', descricao: 'Rotas de hoje com o caminhão, coleta no prazo e quando passa em cada bairro' });

  // Coleta de lixo: rotas de hoje (com o caminhão), no prazo em 30 dias e o calendário por bairro
  // ("quando passa o caminhão no meu bairro?", o que o cidadão quer saber).
  const ST_COLETA = { atrasada: 'Atrasada', em_andamento: 'Na rua', agendada: 'Mais tarde', concluida: 'Concluída', sem_coleta_hoje: 'Não hoje' };
  const SIT_DE_STATUS = { atrasada: 'critica', em_andamento: 'atencao', agendada: 'ok', concluida: 'ok', sem_coleta_hoje: 'neutro' };
  function coleta(r) {
    if (!r) return '';
    const nomeDia = GC.data.coleta.nomeDia;
    const dias = (lista) => (lista.length === 6 && !lista.includes('dom') ? 'seg a sáb' : lista.join(', ')) || '—';
    const rotas = r.rotas.map((x) => `<li><button type="button" data-camada="coleta" data-id="${x.id}" title="Ver a rota no mapa">
        <span class="sit ${SIT_DE_STATUS[x.status]}">${ST_COLETA[x.status]}</span>
        <span class="nome">${x.tipo === 'seletiva' ? '♻ ' : ''}${esc(x.nome)}<small>${esc(dias(x.dias))} · ${esc(x.horario)} · ${x.noPrazoPct}% no prazo${x.status === 'em_andamento' ? ` · ${x.progressoPct}% feito` : ''}${x.motivo ? ` · ${esc(x.motivo)}` : ''}</small></span>
      </button></li>`).join('');
    const cal = r.calendario.map((b) => `<tr class="${b.atrasada ? 'atrasada' : ''}">
        <th><button type="button" data-camada="coleta" data-id="${b.id}" title="Ver no mapa">${esc(b.nome)}</button></th>
        <td>${esc(dias(b.domiciliar.dias))}<small>${esc(b.domiciliar.horario)}</small></td>
        <td>${esc(dias(b.seletiva.dias))}</td>
        <td class="prox">${b.atrasada ? '⚠ atrasada' : esc(b.domiciliar.proxima ? b.domiciliar.proxima.texto : '—')}</td>
      </tr>`).join('');
    return `<div class="w-coleta">
      <div class="w-numeros">
        <div class="w-num ${r.atrasadas.length ? 'critica' : 'bom'}"><b>${r.atrasadas.length}</b><small>${r.atrasadas.length === 1 ? 'rota atrasada' : 'rotas atrasadas'} hoje</small></div>
        <div class="w-num andamento"><b>${r.emAndamento.length} de ${r.deHoje.length}</b><small>rotas de hoje (${esc(nomeDia[r.diaHoje])}) com caminhão na rua</small></div>
        <div class="w-num ${r.noPrazoPct < 95 ? 'alerta' : 'bom'}"><b>${r.noPrazoPct}%</b><small>coletas no prazo (30 dias) · meta 95%</small></div>
        <div class="w-num"><b>${r.toneladasMes.toLocaleString('pt-BR')} t</b><small>recolhidas no mês · ${r.seletivaPct}% na seletiva</small></div>
      </div>
      <div class="w-seg-colunas w-det">
        <div><h4>Rotas · hoje</h4><ul class="w-edu-lista w-coleta-rotas">${rotas}</ul></div>
        <div>
          <h4>Quando passa o caminhão <small>o que o cidadão vê no app</small></h4>
          <table class="w-coleta-cal"><thead><tr><th>Bairro</th><th>Lixo comum</th><th>Recicláveis</th><th>Próxima</th></tr></thead><tbody>${cal}</tbody></table>
        </div>
      </div>
    </div>`;
  }

  GC.conteudoWidget.coleta = (d) => coleta(d.coleta);

  // ---- Versão pública (embed.html): "quando passa o caminhão no meu bairro?". Sem rota, caminhão ou meta.
  const { ic, listaE } = GC.widgetUtil;
  const DIAS_SEMANA = ['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom'];
  const diasPorExtenso = (lista) => {
    const nome = GC.data.coleta.nomeDia;
    if (lista.length === 6 && !lista.includes('dom')) return 'de segunda a sábado';
    return listaE(DIAS_SEMANA.filter((d) => lista.includes(d)).map((d) => nome[d]));
  };
  // "07h–13h" → "das 7h às 13h"; "19h–01h" → "das 19h à 1h".
  const faixaHoraria = (h) => {
    const [ini, fim] = String(h || '').split(/[–-]/).map((x) => x.trim().replace(/^0(\d)/, '$1'));
    if (!ini || !fim) return '';
    return `das ${ini} ${/^1h/.test(fim) ? 'à' : 'às'} ${fim}`;
  };
  function coletaPublica(op = {}) {
    const r = GC.coleta.resumo();
    const bairros = r.calendario.slice().sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    const b = bairros.find((x) => x.id === op.bairro) || null;
    const opcoes = bairros.map((x) => `<option value="${esc(x.id)}"${b && x.id === b.id ? ' selected' : ''}>${esc(x.nome)}</option>`).join('');
    const seletor = `<label class="vp-campo"><span>Seu bairro</span>
      <select data-opcao="bairro"><option value=""${b ? '' : ' selected'}>Escolha o seu bairro</option>${opcoes}</select></label>`;
    if (!b) {
      const hoje = bairros.filter((x) => x.domiciliar.proxima && x.domiciliar.proxima.emDias === 0).length;
      return `<div class="vp-coleta">${seletor}
        <p class="vp-vazio">${ic('calendar')} Escolha o seu bairro para ver os dias e o horário da coleta.</p>
        <p class="vp-fonte">Hoje, ${esc(GC.data.coleta.nomeDia[r.diaHoje])}, tem coleta de lixo comum em ${hoje} de ${bairros.length} bairros.</p>
      </div>`;
    }
    const linha = (rotulo, icone, s) => (s.dias.length
      ? `<li>${ic(icone)}<span><b>${rotulo}</b>${esc(diasPorExtenso(s.dias))}${s.horario ? `, ${esc(s.horario.split(' / ').map(faixaHoraria).join(' ou '))}` : ''}</span></li>`
      : `<li>${ic(icone)}<span><b>${rotulo}</b>Não passa no seu bairro.</span></li>`);
    const prox = b.domiciliar.proxima;
    const inicio = (b.domiciliar.horario.split(/[–-]/)[0] || '').trim().replace(/^0(\d)/, '$1');
    if (prox && inicio) prox.texto = `${prox.texto}, a partir das ${inicio}`;
    const aviso = b.atrasada
      ? `<div class="vp-faixa atencao" role="status">${ic('clock-exclamation')}<div><b>A coleta está atrasada no seu bairro</b>
          <span>Se puder, guarde o lixo dentro de casa até o caminhão passar.</span></div></div>`
      : prox
        ? `<div class="vp-faixa ok">${ic('truck')}<div><b>Próxima coleta: ${esc(prox.texto)}</b>
            <span>Deixe o saco na calçada perto do horário, bem fechado.</span></div></div>`
        : '';
    return `<div class="vp-coleta">${seletor}
      ${aviso}
      <ul class="vp-dias">
        ${linha('Lixo comum', 'trash', b.domiciliar)}
        ${linha('Recicláveis', 'recycle', b.seletiva)}
      </ul>
    </div>`;
  }
  GC.conteudoPublico.coleta = {
    nome: 'Coleta de lixo no seu bairro',
    descricao: 'Dias, horário e a próxima passagem do caminhão em cada bairro',
    opcoes: [{ id: 'bairro', rotulo: 'Bairro já escolhido', valores: () => GC.data.bairros.map((x) => ({ id: x.id, nome: x.nome })) }],
    montar: coletaPublica,
  };
})(window.GC = window.GC || {});
