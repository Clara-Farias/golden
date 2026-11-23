(function (GC) {
  // Conteúdo do widget (HTML puro, sem estado): js/widgets.js chama GC.conteudoWidget.risco(dados do painel, opções).
  const { esc } = GC.widgetUtil;

  // No catálogo (gaveta Widgets e painel padrão).
  GC.registrarWidget({ id: 'risco', ordem: 90, nome: 'Risco climático', emoji: '⚠', icone: 'alert-triangle', categoria: 'tempo_real', descricao: 'Áreas de risco × chuva prevista: onde agir antes de alagar ou deslizar' });

  // Risco climático: alerta preventivo (onde ainda dá para agir antes), chuva prevista e áreas por nível.
  const NIVEL = { alto: 'Alto', medio: 'Médio', baixo: 'Baixo' };
  function risco(r) {
    if (!r) return '';
    const p = r.previsao;
    const maxMm = Math.max(...p.janelas.map((j) => j.mm));
    const chuva = p.janelas.map((j) => `<li><i style="--h:${Math.round((j.mm / maxMm) * 100)}%"></i><b>${j.mm} mm</b><small>em ${j.horas} h</small></li>`).join('');
    const pv = r.preventivo;
    const alerta = pv ? `<div class="w-risco-alerta">
        <div><b>⚠ Risco alto de ${pv.tipo} em ~${pv.horasAte} h · ${esc(pv.nome)}</b>
        <small>${pv.familias} famílias na área · 👉 ${esc(pv.acao)}</small></div>
        <button type="button" class="btn-sec" data-camada="risco" data-id="${pv.id}">📍 Ver no mapa</button>
      </div>` : '<p class="w-risco-ok">✅ Nenhuma área com risco alto ainda não atingida.</p>';
    const areas = r.areas.map((a) => `<li><button type="button" data-camada="risco" data-id="${a.id}" title="Ver ${esc(a.nome)} no mapa">
        <span class="nivel ${a.nivel}">${NIVEL[a.nivel]}</span>
        <span class="nome">${a.tipo === 'deslizamento' ? '⛰' : '🌧'} ${esc(a.nome)}<small>${a.horasAte === null ? 'sem risco em 24 h' : `limiar em ~${a.horasAte} h`} · ${a.familias} famílias</small></span>
        ${a.atingida ? '<span class="atingida">🚨 atingida agora</span>' : ''}
      </button></li>`).join('');
    return `<div class="w-risco">
      ${alerta}
      <div class="w-risco-colunas">
        <div>
          <h4>Chuva prevista <small>${esc(p.fonte)} · há ${p.atualizadaHaMin} min · já choveu ${p.acumulado72h} mm em 72 h</small></h4>
          <ul class="w-chuva">${chuva}</ul>
          <p class="w-risco-resumo"><b>${r.familiasRiscoAlto}</b> famílias em áreas de risco alto · <b>${r.atingidas.length}</b> ${r.atingidas.length === 1 ? 'área já atingida' : 'áreas já atingidas'}</p>
        </div>
        <div class="w-det">
          <h4>Áreas de risco mapeadas</h4>
          <ul class="w-risco-areas">${areas}</ul>
        </div>
      </div>
    </div>`;
  }

  GC.conteudoWidget.risco = (d) => risco(d.risco);

  // ---- Versão pública (embed.html): o alerta como o morador precisa ler. Sem número de famílias, sem a ação
  // interna da Defesa Civil; com o que fazer e os telefones de emergência.
  const { ic, nomeBairro, listaE } = GC.widgetUtil;
  const NIVEL_PUB = { alto: 'Risco alto', medio: 'Atenção' };
  const O_QUE_FAZER = {
    deslizamento: [
      'Se a sirene tocar, saia de casa e vá para o abrigo indicado pela Defesa Civil.',
      'Rachadura nova na parede, porta emperrando ou barulho na encosta: saia e ligue 199.',
    ],
    alagamento: [
      'Não atravesse ruas alagadas, nem a pé nem de carro.',
      'Desligue da tomada o que estiver perto do chão e suba documentos e remédios.',
    ],
  };
  function riscoPublico() {
    const ocorrencias = (GC.data && GC.data.ocorrencias) || [];
    const r = GC.risco.resumo(ocorrencias);
    const p = r.previsao;
    const atencao = r.areas.filter((a) => a.nivel !== 'baixo');
    const total24 = p.janelas[p.janelas.length - 1].mm;
    const nomes = r.altas.map((a) => esc(nomeBairro(a.bairroId)));
    const unicos = [...new Set(nomes)];
    const faixa = r.altas.length
      ? `<div class="vp-faixa critica" role="alert">${ic('alert-triangle')}<div><b>Alerta de chuva forte</b>
          <span>Até ${total24} mm nas próximas 24 h. Risco alto em ${listaE(unicos)}.</span></div></div>`
      : atencao.length
        ? `<div class="vp-faixa atencao">${ic('cloud-rain')}<div><b>Atenção para chuva</b>
            <span>Até ${total24} mm nas próximas 24 h. Fique de olho nos avisos.</span></div></div>`
        : `<div class="vp-faixa ok">${ic('circle-check')}<div><b>Sem alerta de chuva agora</b>
            <span>A previsão para as próximas 24 h é de ${total24} mm.</span></div></div>`;
    const maxMm = Math.max(...p.janelas.map((j) => j.mm), 1);
    const chuva = p.janelas.map((j) => `<li><i style="--h:${Math.round((j.mm / maxMm) * 100)}%"></i><b>${j.mm} mm</b><small>em ${j.horas} h</small></li>`).join('');
    const areas = atencao.map((a) => `<li class="${a.nivel}">
        <span class="vp-nivel ${a.nivel}">${NIVEL_PUB[a.nivel]}</span>
        <span>${esc(a.nome)}<small>${esc(nomeBairro(a.bairroId))} · ${a.atingida
          ? `já tem ${a.tipo === 'deslizamento' ? 'deslizamento' : 'alagamento'} registrado`
          : `a chuva pode passar do limite em cerca de ${a.horasAte} h`}</small></span></li>`).join('');
    const tipos = [...new Set(atencao.map((a) => a.tipo))];
    const dicas = tipos.flatMap((t) => O_QUE_FAZER[t] || []).map((t) => `<li>${esc(t)}</li>`).join('');
    return `<div class="vp-risco">
      ${faixa}
      <h3>Chuva prevista</h3>
      <ul class="vp-chuva" aria-label="Chuva prevista a partir de agora">${chuva}</ul>
      ${areas ? `<h3>Áreas em atenção</h3><ul class="vp-lista">${areas}</ul>` : ''}
      ${dicas ? `<h3>O que fazer</h3><ul class="vp-dicas">${dicas}</ul>` : ''}
      <p class="vp-emergencia">${ic('phone')} Emergência: <b>Defesa Civil 199</b> · <b>Bombeiros 193</b></p>
      <p class="vp-fonte">Previsão: ${esc(p.fonte)}, atualizada há ${p.atualizadaHaMin} min.</p>
    </div>`;
  }
  GC.conteudoPublico.risco = {
    nome: 'Alerta de chuva',
    descricao: 'Chuva prevista, áreas de risco em atenção e o que fazer',
    montar: riscoPublico,
  };
})(window.GC = window.GC || {});
