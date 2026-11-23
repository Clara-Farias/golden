(function (GC) {
  // Conteúdo do widget (HTML puro, sem estado): js/widgets.js chama GC.conteudoWidget.social(dados do painel, opções).
  const { esc } = GC.widgetUtil;

  // No catálogo (gaveta Widgets e painel padrão).
  GC.registrarWidget({ id: 'social', ordem: 130, nome: 'Busca ativa · CadÚnico', emoji: '🤝', icone: 'users-group', categoria: 'social', descricao: 'Famílias vulneráveis faltando a consultas e crianças faltando à consulta e à escola, por bairro' });

  // Busca ativa (CadÚnico × Saúde × Escola): famílias vulneráveis faltando a consultas, crianças que faltam
  // à consulta e à escola, o efeito (pequeno) dos lembretes nelas e os bairros, do que mais falta ao que menos.
  // Só números agregados por bairro: a lista nominal fica com o CRAS e a UBS.
  function social(r) {
    if (!r) return '';
    const n = (v) => v.toLocaleString('pt-BR');
    const e = r.efeitoLembrete;
    const SIT = { critica: 'ruim', atencao: 'medio', ok: 'bom' };
    const max = Math.max(...r.bairros.map((b) => b.taxaPct), 1);
    const MAX = 8;
    const lista = r.bairros.slice(0, MAX).map((b) => `<li><button type="button" data-destaque="${b.id}" data-legenda="Famílias vulneráveis faltando a consultas · bairros em destaque" title="Destacar ${esc(b.nome)} no mapa">
        <span>${esc(b.nome)}<small>${n(b.faltando)} famílias · ${n(b.criancas)} crianças · cadastro ${b.atualizadoPct}% atualizado</small></span>
        <i style="--v:${Math.round((b.taxaPct / max) * 100)}%" class="${SIT[b.situacao]}"></i><b>${b.taxaPct.toLocaleString('pt-BR')}%</b></button></li>`).join('');
    // Duas linhas (cidade × vulneráveis), 12 meses, com o marco dos lembretes.
    const L = 300; const A = 70; const m = 4;
    const todos = [...r.serie.geral, ...r.serie.vulneraveis];
    const lo = Math.min(...todos) - 1; const hi = Math.max(...todos) + 1;
    const x = (i) => m + (i * (L - 2 * m)) / (r.serie.geral.length - 1);
    const y = (v) => A - m - ((v - lo) * (A - 2 * m)) / (hi - lo);
    const linha = (v) => v.map((p, i) => `${x(i).toFixed(1)},${y(p).toFixed(1)}`).join(' ');
    return `<div class="w-social">
      <div class="w-numeros">
        <div class="w-num"><b>${n(r.vulneraveis)}</b><small>famílias vulneráveis, de ${n(r.familias)} no CadÚnico</small></div>
        <div class="w-num ${r.criticos.length ? 'critica' : 'alerta'}"><b>${n(r.faltando)}</b><small>faltaram a 2+ consultas em 90 dias (${r.faltandoPct.toLocaleString('pt-BR')}%)</small></div>
        <div class="w-num alerta"><b>${n(r.criancas)}</b><small>crianças faltando à consulta e à escola: busca ativa</small></div>
        <div class="w-num ${r.atualizadoPct < 80 ? 'alerta' : ''}"><b>${r.atualizadoPct}%</b><small>cadastros atualizados (meta 80%)</small></div>
      </div>
      ${r.criticos.length ? `<button type="button" class="btn-sec w-social-criticos" data-destaque="${r.criticos.map((b) => b.id).join(',')}" data-legenda="Famílias vulneráveis faltando a consultas · bairros em destaque">🗺 Ver no mapa os ${r.criticos.length} bairros críticos</button>` : ''}
      <div class="w-social-lembrete w-det">
        <h4>Lembretes por WhatsApp (desde ${esc(r.serie.rotulos[r.serie.marco] || 'jun')})</h4>
        <p>Na cidade, as faltas caíram de <b>${e.geralAntes.toLocaleString('pt-BR')}%</b> para <b>${e.geralDepois.toLocaleString('pt-BR')}%</b>. Nas famílias vulneráveis, só de <b>${e.vulneraveisAntes.toLocaleString('pt-BR')}%</b> para <b>${e.vulneraveisDepois.toLocaleString('pt-BR')}%</b>: ${n(r.semLembrete)} das que faltam não têm celular atualizado no cadastro. 👉 Busca ativa do agente de saúde com o CRAS.</p>
        <svg viewBox="0 0 ${L} ${A}" role="img" aria-label="Faltas em consultas, 12 meses: cidade de ${r.serie.geral[0]}% para ${r.serie.geral[r.serie.geral.length - 1]}%; famílias vulneráveis de ${r.serie.vulneraveis[0]}% para ${r.serie.vulneraveis[r.serie.vulneraveis.length - 1]}%">
          <line x1="${x(r.serie.marco).toFixed(1)}" x2="${x(r.serie.marco).toFixed(1)}" y1="${m}" y2="${A - m}" class="w-social-marco"/>
          <polyline points="${linha(r.serie.vulneraveis)}" class="w-social-vul"/>
          <polyline points="${linha(r.serie.geral)}" class="w-social-geral"/>
        </svg>
        <p class="w-legenda"><span><i style="background:var(--critica)"></i>famílias vulneráveis</span><span><i style="background:var(--navy)"></i>cidade</span><span><i style="background:#8fa0a4"></i>início dos lembretes</span></p>
      </div>
      <div class="w-det">
        <h4>Bairros · % das famílias vulneráveis faltando <small>${r.bairros.length > MAX ? `os ${MAX} com mais famílias, de ${r.bairros.length}` : ''}</small></h4>
        <ul class="w-satisf w-leitos-lista w-social-bairros">${lista}</ul>
        <p class="w-legenda">Só números por bairro. A lista com nomes fica com o CRAS e a UBS do território. Fonte: ${esc(r.fonte)}.</p>
      </div>
    </div>`;
  }

  GC.conteudoWidget.social = (d) => social(d.social);
})(window.GC = window.GC || {});
