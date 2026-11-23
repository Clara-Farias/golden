(function (GC) {
  // Conteúdo do widget (HTML puro, sem estado): js/widgets.js chama GC.conteudoWidget.entregas(dados do painel, opções).
  // Agenda de entregas (js/data-entregas.js): entregues no ano, as próximas e as que precisam de atenção (paradas,
  // atrasadas e em risco). Segue o filtro de secretarias e o bairro em foco (d.entregas, montado no js/app.js).
  // Spec: docs/specs/2026-11-12-vila-dourada-agenda-de-entregas-design.md.
  const { esc, plural, nomeBairro, ic } = GC.widgetUtil;

  GC.registrarWidget({ id: 'entregas', ordem: 380, nome: 'Agenda de entregas', emoji: '📦', icone: 'package', categoria: 'gestao', descricao: 'O que a prefeitura entregou no ano, o que vem nos próximos 30 dias e as entregas atrasadas ou em risco' });

  const nomeArea = (id) => ((GC.data.areas || []).find((a) => a.id === id) || { nome: id }).nome;
  const MES_CURTO = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

  // Etiqueta da situação (a mesma da tela #/entregas).
  const etiqueta = (e) => `<span class="w-ent-sit ${e.situacao}">${esc(GC.entregas.rotulo(e))}</span>`;
  // Onde: bairro ou "cidade inteira".
  const onde = (e) => (e.bairroId ? nomeBairro(e.bairroId) : 'cidade inteira');
  // Obra abre o pino no mapa; serviço não tem ponto.
  const abre = (e) => (e.origem.obra ? ` data-camada="obras" data-id="${esc(e.origem.obra)}" title="Ver a obra no mapa"` : '');

  function item(e, linha) {
    const d = e.dataAtual;
    const tag = e.origem.obra ? 'button type="button"' : 'div';
    return `<li><${tag} class="w-ent-item"${abre(e)}>
      <span class="w-ent-data"><b>${+d.slice(8, 10)}</b><small>${MES_CURTO[+d.slice(5, 7) - 1]}</small></span>
      <span class="nome">${esc(e.titulo)}<small>${esc(linha)}</small></span>
      ${etiqueta(e)}
    </${tag.split(' ')[0]}></li>`;
  }

  function entregas(r) {
    if (!r) return '';
    const atencao = r.atencao;
    const proximas = r.proximas30.slice(0, 5);
    const numeros = `<div class="w-numeros">
        <div class="w-num bom"><b>${r.entregues.length}</b><small>${r.entregues.length === 1 ? 'entregue' : 'entregues'} no ano</small></div>
        <div class="w-num"><b>${r.proximas30.length}</b><small>${r.proximas30.length === 1 ? 'prevista' : 'previstas'} nos próximos 30 dias</small></div>
        <div class="w-num ${atencao.length ? 'critica' : 'bom'}"><b>${atencao.length}</b><small>${atencao.length === 1 ? 'precisa' : 'precisam'} de atenção</small></div>
      </div>`;
    const listaProx = proximas.length
      ? `<ul class="w-ent-lista">${proximas.map((e) => item(e, `${nomeArea(e.area)} · ${onde(e)} · ${GC.entregas.quando(e)}`)).join('')}</ul>`
      : `<p class="w-ent-vazio">${ic('calendar')} Nenhuma entrega prevista nos próximos 30 dias.</p>`;
    const listaAt = atencao.length
      ? `<ul class="w-ent-lista">${atencao.slice(0, 4).map((e) => item(e, `${nomeArea(e.area)} · ${GC.entregas.situacaoEmPalavras(e)}`)).join('')}</ul>
        ${atencao.length > 4 ? `<p class="w-legenda">e mais ${plural(atencao.length - 4, 'entrega', 'entregas')} na agenda.</p>` : ''}`
      : `<p class="w-ent-vazio">${ic('circle-check')} Nenhuma entrega parada, atrasada ou em risco.</p>`;
    return `<div class="w-ent">
      ${numeros}
      <h4>Próximas</h4>${listaProx}
      <h4>Precisam de atenção</h4>${listaAt}
      <a class="w-ent-abrir" href="#/entregas">Abrir a agenda de entregas →</a>
    </div>`;
  }

  GC.conteudoWidget.entregas = (d = {}) => {
    if (!GC.entregas) return '';
    const r = typeof d.entregas === 'function' ? d.entregas() : d.entregas;
    return entregas(r || GC.entregas.resumo({ bairro: d.bairro || null }));
  };

  // Peças que a tela #/entregas (js/tela-entregas.js) reaproveita.
  GC.entregasUi = { etiqueta, onde, nomeArea, MES_CURTO };

  // ---- Versão pública (embed.html): "Próximas entregas no seu bairro". A mesma franqueza do widget de obras
  // (remarcada com a data antiga, parada), sem o "em risco" (projeção interna: aparece no prazo), sem pasta
  // interna além do nome da secretaria e sem as entregas marcadas como não públicas.
  const RECENTES_DIAS = 90;
  const CLS_PUB = { entregue: 'entregue', no_prazo: 'ok', em_risco: 'ok', atrasada: 'atencao', parada: 'critica' };
  const bairrosComEntrega = () => [...new Set(GC.entregas.lista().filter((e) => e.publica && e.bairroId).map((e) => e.bairroId))]
    .map((id) => ({ id, nome: nomeBairro(id) })).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  function entregasPublico(op = {}) {
    const bairros = bairrosComEntrega();
    const bairro = bairros.some((b) => b.id === op.bairro) ? op.bairro : '';
    // No bairro escolhido entram também as da cidade inteira (serviço que chega a todos).
    const todas = GC.entregas.lista().filter((e) => e.publica && (!bairro || e.bairroId === bairro || !e.bairroId));
    const vem = todas.filter((e) => e.situacao !== 'entregue');
    const feitas = todas.filter((e) => e.situacao === 'entregue' && e.diasParaEntrega >= -RECENTES_DIAS).reverse();
    const linha = (e) => `<li><span class="vp-nivel ${CLS_PUB[e.situacao]}">${esc(GC.entregas.rotulo(e, { publico: true }))}</span>
        <span class="vp-obra"><b>${esc(e.titulo)}</b><small>${esc(onde(e))} · ${esc(GC.entregas.situacaoEmPalavras(e, { publico: true }))}</small>
          ${e.descricao ? `<small>${esc(e.descricao)}</small>` : ''}</span></li>`;
    const bloco = (titulo, lista, vazio) => `<h3>${titulo}</h3>${lista.length ? `<ul class="vp-lista">${lista.map(linha).join('')}</ul>` : `<p class="vp-vazio">${ic('info-circle')} ${vazio}</p>`}`;
    return `<div class="vp-obras vp-entregas">
      ${GC.widgetUtil.escolha('bairro', 'Bairro', 'Toda a cidade', bairros, bairro)}
      <div class="vp-numeros">
        <div><b>${vem.length}</b><small>${vem.length === 1 ? 'entrega a caminho' : 'entregas a caminho'}</small></div>
        <div><b>${feitas.length}</b><small>${feitas.length === 1 ? 'entregue' : 'entregues'} nos últimos 3 meses</small></div>
      </div>
      ${bloco('Vem aí', vem, 'Nenhuma entrega prevista aqui agora.')}
      ${bloco('Entregues recentemente', feitas, 'Nenhuma entrega nos últimos 3 meses.')}
      <p class="vp-fonte">Datas previstas pela Prefeitura; quando uma data muda, a anterior aparece entre parênteses. Dúvidas: ${esc(GC.widgetUtil.telefone())}.</p>
    </div>`;
  }
  GC.conteudoPublico = GC.conteudoPublico || {};
  GC.conteudoPublico.entregas = {
    nome: 'Próximas entregas',
    descricao: 'Obras e serviços que a Prefeitura vai entregar e os entregues nos últimos 3 meses, por bairro',
    opcoes: [{ id: 'bairro', rotulo: 'Bairro já escolhido', valores: () => bairrosComEntrega() }],
    montar: entregasPublico,
  };
})(window.GC = window.GC || {});
