(function (GC) {
  // Conteúdo do widget (HTML puro, sem estado): js/widgets.js chama GC.conteudoWidget.seguranca(dados do painel, opções).
  const { esc, nomeBairro } = GC.widgetUtil;

  // No catálogo (gaveta Widgets e painel padrão).
  GC.registrarWidget({ id: 'seguranca', ordem: 100, nome: 'Segurança', emoji: '🛡', icone: 'shield', categoria: 'seguranca', descricao: 'B.O.s de hoje e do mês, tipos, bairro mais crítico e violência contra mulheres e crianças' });

  // Segurança: B.O.s de hoje e do mês, bairro mais crítico, tipos e o bloco de violência contra
  // mulheres e crianças (sempre agregado por bairro).
  const sinal = (n) => `${n > 0 ? '+' : ''}${n}%`;
  function seguranca(s) {
    if (!s) return '';
    const maxTipo = s.porTipo[0].n;
    const tipos = s.porTipo.map((t) => `<li><span>${esc(t.tipo)}</span><i style="--v:${Math.round((t.n / maxTipo) * 100)}%" class="medio"></i><b>${t.n}</b></li>`).join('');
    const v = s.violencia;
    const top = v.porBairro.slice(0, 3);
    return `<div class="w-seg">
      <div class="w-numeros">
        <div class="w-num ${s.hojeAlto ? 'alerta' : ''}"><b>${s.hoje}</b><small>B.O.s hoje até ${esc(s.ateHora)} · média ${s.mediaDia.toLocaleString('pt-BR')}/dia (${sinal(s.hojeVariacaoPct)})</small></div>
        <div class="w-num ${s.mesVariacaoPct > 0 ? 'alerta' : 'bom'}"><b>${s.total30d}</b><small>B.O.s em 30 dias · ${sinal(s.mesVariacaoPct)} no mês</small></div>
        <div class="w-num critica"><b>${esc(nomeBairro(s.bairroCritico.id))}</b><small>bairro com mais B.O.s · ${s.bairroCritico.total} (${s.bairroCritico.pct}% da cidade)</small></div>
      </div>
      <div class="w-seg-colunas">
        <div class="w-det">
          <h4>Por tipo · 30 dias <button type="button" class="btn-sec" data-camada="calor-bo">🔥 Ver mapa de calor</button></h4>
          <ul class="w-barras">${tipos}</ul>
        </div>
        <div class="w-vmc ${v.subindo ? 'subindo' : ''}">
          <h4>Violência contra mulheres e crianças</h4>
          <p class="w-vmc-num"><b>${v.mes}</b> casos no mês <span class="${v.subindo ? 'ruim' : 'bom'}">${sinal(v.variacaoPct)} vs. mês anterior · ${sinal(v.variacaoAnoPct)} em 12 meses</span></p>
          <p class="w-vmc-detalhe">👤 ${v.mulheres} contra mulheres · ${v.criancas} contra crianças e adolescentes</p>
          <ul class="w-vmc-bairros">${top.map((b) => `<li><span>${esc(nomeBairro(b.id))}</span><b>${esc(b.texto)}</b></li>`).join('')}</ul>
          <button type="button" class="btn-sec" data-destaque="${top.map((b) => b.id).join(',')}" data-legenda="Violência contra mulheres e crianças · bairros com mais casos no mês">📍 Ver bairros no mapa</button>
          <small>Só números por bairro: o endereço das vítimas não aparece no painel.</small>
        </div>
      </div>
    </div>`;
  }

  GC.conteudoWidget.seguranca = (d) => seguranca(d.seguranca);
})(window.GC = window.GC || {});
