(function (GC) {
  // Telão · agenda de entregas (js/data-entregas.js): as próximas entregas dos 30 dias e até duas que precisam de
  // atenção (paradas, atrasadas ou em risco). Segue o filtro de secretarias do mapa; sem nada previsto nem em
  // atenção no recorte, a cena é pulada.
  const MAX = 4;
  const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
  const ICONE = { no_prazo: 'calendar-event', em_risco: 'alert-triangle', atrasada: 'clock-exclamation', parada: 'player-pause' };

  // Secretarias no filtro do mapa (pelo desempenho, que já vem filtrado); sem a informação, todas.
  function areasDoFiltro(dados) {
    const secs = dados && dados.desempenho && dados.desempenho.secretarias;
    const areas = secs ? secs.filter((s) => s.noFiltro).map((s) => s.area) : [];
    return areas.length ? areas : null;
  }
  function recorte(dados) {
    if (!GC.entregas) return null;
    const r = GC.entregas.resumo({ areas: areasDoFiltro(dados) });
    return { r, proximas: r.proximas30.filter((e) => e.situacao === 'no_prazo'), atencao: r.atencao };
  }
  const dia = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

  GC.cenasTelao = GC.cenasTelao || [];
  GC.cenasTelao.push({
    id: 'entregas',
    ordem: 70,
    nome: 'Agenda de entregas',
    descricao: 'As entregas previstas para os próximos 30 dias e as que estão paradas, atrasadas ou em risco',
    disponivel: (dados) => { const x = recorte(dados); return !!(x && (x.proximas.length || x.atencao.length)); },
    montar({ dados }) {
      const x = recorte(dados);
      if (!x || (!x.proximas.length && !x.atencao.length)) return null;
      const esc = GC.escaparHtml;
      const nomeArea = (id) => ((GC.data.areas || []).find((a) => a.id === id) || { nome: id }).nome;
      const linha = (e, sub, cls = '') => `<li class="${cls}"><i class="ti ti-${ICONE[e.situacao] || 'package'}" aria-hidden="true"></i><span>${esc(e.titulo)}<small>${esc(sub)}</small></span>`
        + `<time>${dia(e.dataAtual)}</time></li>`;
      const itens = x.proximas.slice(0, MAX).map((e) => linha(e, `${nomeArea(e.area)} · ${GC.entregas.quando(e)}`, 'tz-curso')).join('');
      const atencao = x.atencao.length ? `<ul class="tr-lista tz-atrasadas">${x.atencao.slice(0, 2).map((e) => linha(e, `${GC.entregas.rotulo(e)} · ${GC.entregas.situacaoEmPalavras(e)}`)).join('')}</ul>` : '';
      const titulo = x.proximas.length
        ? `${plural(x.proximas.length, 'entrega prevista', 'entregas previstas')} em 30 dias${x.atencao.length ? `, ${plural(x.atencao.length, 'precisa', 'precisam')} de atenção` : ''}`
        : `${plural(x.atencao.length, 'entrega precisa', 'entregas precisam')} de atenção`;
      return {
        rotulo: 'Agenda de entregas',
        sub: `${plural(x.r.entregues.length, 'entregue', 'entregues')} no ano`,
        titulo,
        html: `${itens ? `<ul class="tr-lista tz-lista">${itens}</ul>` : ''}${atencao}`,
      };
    },
  });
})(window.GC = window.GC || {});
