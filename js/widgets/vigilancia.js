(function (GC) {
  // Conteúdo do widget (HTML puro, sem estado): js/widgets.js chama GC.conteudoWidget.vigilancia(dados do painel, opções).
  // Lê os dados sozinho (js/data-vigilancia.js); sem eles, devolve vazio.
  const { esc, plural } = GC.widgetUtil;

  // No catálogo (gaveta Widgets e painel padrão).
  GC.registrarWidget({ id: 'vigilancia', ordem: 115, nome: 'Vigilância em Saúde', emoji: '🦟', icone: 'bug', categoria: 'saude', descricao: 'Cobertura vacinal por bairro, LIRAa do Aedes, casos de dengue e chamados de zoonoses' });

  const num = (n) => n.toLocaleString('pt-BR');
  const pctBR = (n) => `${num(n)}%`;
  const NIVEL = { risco: 'Risco', alerta: 'Alerta', satisfatorio: 'Bom' };
  const ids = (lista) => lista.map((x) => x.id).join(',');

  // Vigilância: números da cidade, faixa de LIRAa em risco, bairros (vacina × Aedes × casos) e pontos que pedem ação.
  function vigilancia(r) {
    const c = r.cidade;
    const subiu = c.variacaoPct > 0;
    const faixa = r.liraaRisco.length
      ? `<div class="w-vig-alerta">
          <div><b>⚠ LIRAa em risco em ${r.liraaRisco.map((x) => `${esc(x.nome)} (${pctBR(x.liraa)})`).join(' e ')}</b>
          <small>${esc(r.ciclo.nome)}: 4% ou mais dos imóveis com larva. 👉 Mutirão casa a casa e bloqueio de transmissão.</small></div>
          <button type="button" class="btn-sec" data-destaque="${ids(r.liraaRisco)}" data-legenda="LIRAa em risco (4% ou mais)">📍 Ver no mapa</button>
        </div>`
      : '<p class="w-vig-ok">✅ Nenhum bairro com LIRAa em risco.</p>';
    const bairros = r.bairros.map((x) => `<li><button type="button" data-destaque="${x.id}" data-legenda="${esc(x.nome)}: vacina ${x.coberturaInfantil}%, LIRAa ${pctBR(x.liraa)}" title="Ver ${esc(x.nome)} no mapa">
        <span class="nome">${esc(x.nome)}<small>${x.casosSemana} ${x.casosSemana === 1 ? 'caso' : 'casos'} em 7 dias${x.razao >= 2 ? ` · ${num(x.razao)} vezes a média` : ''}</small></span>
        <span class="vac ${x.abaixoMeta ? 'abaixo' : ''}">💉 ${x.coberturaInfantil}%</span>
        <span class="liraa ${x.nivelLiraa}">${NIVEL[x.nivelLiraa]} ${pctBR(x.liraa)}</span>
      </button></li>`).join('');
    const acao = r.pontos.filter((p) => p.classe !== 'ok').map((p) => `<li><button type="button" data-camada="vigilancia" data-id="${p.id}" title="Ver no mapa">
        <span class="sit ${p.classe}">${p.grupo === 'aedes' ? '🦟' : '🐾'}</span>
        <span class="nome">${esc(p.nome)}<small>${esc(p.rotuloSituacao)}${p.situacao === 'foco' ? ` · ${plural(p.depositos, 'depósito com larva', 'depósitos com larva')}` : ''}</small></span>
      </button></li>`).join('');
    return `<div class="w-vig">
      <div class="w-numeros">
        <div class="w-num ${c.coberturaInfantil < r.meta.infantil ? 'alerta' : 'bom'}"><b>${c.coberturaInfantil}%</b><small>vacinas do calendário infantil · meta ${r.meta.infantil}%</small></div>
        <div class="w-num ${c.gripe60 < r.meta.gripe60 ? 'alerta' : 'bom'}"><b>${c.gripe60}%</b><small>idosos vacinados contra a gripe · meta ${r.meta.gripe60}%</small></div>
        <div class="w-num ${c.nivelLiraa === 'risco' ? 'critica' : c.nivelLiraa === 'alerta' ? 'alerta' : 'bom'}"><b>${pctBR(c.liraa)}</b><small>LIRAa da cidade · ${NIVEL[c.nivelLiraa].toLowerCase()}</small></div>
        <div class="w-num ${subiu ? 'critica' : 'bom'}"><b>${c.casosSemana}</b><small>casos suspeitos de dengue em 7 dias · ${subiu ? '+' : ''}${c.variacaoPct}% na semana</small></div>
      </div>
      ${faixa}
      ${r.abaixoMeta.length ? `<button type="button" class="w-vig-meta" data-destaque="${ids(r.abaixoMeta)}" data-legenda="Vacinação infantil abaixo da meta de ${r.meta.infantil}%">💉 ${plural(r.abaixoMeta.length, 'bairro', 'bairros')} abaixo da meta de vacinação: ${r.abaixoMeta.map((x) => esc(x.nome)).join(', ')}</button>` : ''}
      <div class="w-vig-colunas w-det">
        <div>
          <h4>Por bairro <small>vacina infantil · LIRAa do ${esc(r.ciclo.nome.replace(' do LIRAa', ''))}</small></h4>
          <ul class="w-vig-bairros">${bairros}</ul>
        </div>
        <div>
          <h4>Pedem ação <small>${plural(r.focos.length, 'foco ativo', 'focos ativos')} · ${plural(r.zoonosesAbertas.length, 'chamado de zoonoses', 'chamados de zoonoses')}</small></h4>
          ${acao ? `<ul class="w-vig-pontos">${acao}</ul>` : '<p class="w-vig-ok">✅ Nenhum ponto pendente.</p>'}
        </div>
      </div>
    </div>`;
  }

  GC.conteudoWidget.vigilancia = () => (GC.vigilancia ? vigilancia(GC.vigilancia.resumo()) : '');
})(window.GC = window.GC || {});
