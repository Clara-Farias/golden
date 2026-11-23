(function (GC) {
  // Conteúdo do widget (HTML puro, sem estado): js/widgets.js chama GC.conteudoWidget.leitos(dados do painel, opções).
  const { esc } = GC.widgetUtil;

  // No catálogo (gaveta Widgets e painel padrão).
  GC.registrarWidget({ id: 'leitos', ordem: 110, nome: 'Leitos da rede', emoji: '🛏', icone: 'bed', categoria: 'saude', descricao: 'Ocupação de hospitais e UPAs, vagas de UTI e atendimentos do dia' });

  // Leitos: números da rede, uma barra por unidade (da mais cheia à mais folgada) e atendimentos do dia.
  function leitos(r) {
    if (!r) return '';
    const sit = (p) => GC.leitos.situacao(p);
    const tipos = Object.entries(r.atendimentosHoje.porTipo).sort((a, b) => b[1] - a[1])
      .map(([t, n]) => `${esc(t)} <b>${n}</b>`).join(' · ');
    const lista = r.unidades.map((u) => {
      const pior = Math.max(u.pct, u.utiPct || 0);
      const cor = u.situacao === 'critica' ? 'ruim' : u.situacao === 'atencao' ? 'medio' : 'bom';
      const uti = u.utiPct !== null ? ` · UTI ${u.utiPct}%` : '';
      return `<li><button type="button" data-camada="leitos" data-id="${u.id}" title="Ver ${esc(u.nome)} no mapa">
        <span>${u.tipo === 'upa' ? '🚑' : '🏥'} ${esc(u.nome)}<small>${u.livres} livres${uti}</small></span><i style="--v:${pior}%" class="${cor}"></i><b>${pior}%</b>
      </button></li>`;
    }).join('');
    return `<div class="w-leitos">
      <div class="w-numeros">
        <div class="w-num ${sit(r.pct) === 'ok' ? '' : 'alerta'}"><b>${r.pct}%</b><small>leitos ocupados</small></div>
        <div class="w-num"><b>${r.livres}</b><small>leitos livres de ${r.total}</small></div>
        <div class="w-num ${sit(r.utiPct) === 'ok' ? '' : 'alerta'}"><b>${r.utiLivres}</b><small>vagas de UTI · ${r.utiPct}% ocupada</small></div>
        <div class="w-num ${r.emAlerta.length ? 'critica' : 'bom'}"><b>${r.emAlerta.length}</b><small>${r.emAlerta.length === 1 ? 'unidade' : 'unidades'} em situação crítica</small></div>
      </div>
      <ul class="w-satisf w-leitos-lista w-det">${lista}</ul>
      <p class="w-leitos-atend">🩺 <b>${r.atendimentosHoje.total}</b> atendimentos hoje · ${tipos}</p>
    </div>`;
  }

  GC.conteudoWidget.leitos = (d) => leitos(d.leitos);

  // ---- Versão pública (embed.html): como estão hospitais e UPAs agora e para onde ir. Sem atendimentos por
  // tipo nem percentual de cada ala; a situação vira palavra e cor.
  const { ic, nomeBairro } = GC.widgetUtil;
  const SIT_PUB = { critica: ['Muito cheio', 'critica'], atencao: ['Cheio', 'atencao'], ok: ['Com vagas', 'ok'] };
  const ORDEM_SIT = { ok: 0, atencao: 1, critica: 2 };
  function leitosPublico() {
    const r = GC.leitos.resumo();
    const lista = r.unidades.slice()
      .sort((a, b) => ORDEM_SIT[a.situacao] - ORDEM_SIT[b.situacao] || b.livres - a.livres)
      .map((u) => {
        const [rotulo, cls] = SIT_PUB[u.situacao];
        return `<li><span class="vp-nivel ${cls}">${rotulo}</span>
          <span>${ic(u.tipo === 'upa' ? 'ambulance' : 'building-hospital')} ${esc(u.nome)}<small>${esc(nomeBairro(u.bairroId))} · ${u.livres} ${u.livres === 1 ? 'leito livre' : 'leitos livres'}</small></span></li>`;
      }).join('');
    return `<div class="vp-leitos">
      <div class="vp-numeros">
        <div><b>${r.livres}</b><small>leitos livres na rede</small></div>
        <div><b>${r.utiLivres}</b><small>${r.utiLivres === 1 ? 'vaga de UTI' : 'vagas de UTI'}</small></div>
      </div>
      <h3>Como está cada unidade</h3>
      <ul class="vp-lista">${lista}</ul>
      <ul class="vp-dicas">
        <li>Caso grave (falta de ar, dor no peito, desmaio): ligue <b>192</b>, o SAMU.</li>
        <li>Febre, gripe ou dor leve: procure a unidade de saúde do seu bairro. A espera costuma ser menor.</li>
      </ul>
    </div>`;
  }
  GC.conteudoPublico.leitos = {
    nome: 'Hospitais e UPAs agora',
    descricao: 'Leitos livres na rede e como está cada hospital e UPA',
    montar: leitosPublico,
  };
})(window.GC = window.GC || {});
