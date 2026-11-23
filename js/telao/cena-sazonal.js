(function (GC) {
  // Telão · época do ano (js/data-sazonal.js): a temporada em curso, o que está sendo preparado e as metas de
  // preparo atrasadas. Segue o filtro de secretarias do mapa; sem temporada nem preparo no recorte, a cena é pulada.
  const MAX = 4;
  const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

  // Secretarias no filtro do mapa (pelo desempenho, que já vem filtrado); sem a informação, todas.
  const noFiltro = (dados) => {
    const secs = dados && dados.desempenho && dados.desempenho.secretarias;
    const areas = secs ? secs.filter((s) => s.noFiltro).map((s) => s.area) : [];
    return (t) => !areas.length || areas.includes(t.area);
  };
  function recorte(dados) {
    if (!GC.sazonal) return null;
    const vale = noFiltro(dados);
    const s = GC.sazonal.agora();
    const curso = s.emCurso.filter(vale);
    const preparo = s.emPreparo.filter(vale);
    const atrasadas = [...curso, ...preparo].flatMap((t) => t.metasAtrasadas);
    return { s, curso, preparo, atrasadas };
  }

  GC.cenasTelao = GC.cenasTelao || [];
  GC.cenasTelao.push({
    id: 'sazonal',
    ordem: 60,
    nome: 'Época do ano',
    descricao: 'A temporada em curso (chuvas, dengue…), o que está sendo preparado e os compromissos de preparo atrasados',
    disponivel: (dados) => { const r = recorte(dados); return !!(r && (r.curso.length || r.preparo.length)); },
    montar({ dados }) {
      const r = recorte(dados);
      if (!r || (!r.curso.length && !r.preparo.length)) return null;
      const esc = GC.escaparHtml;
      const nomeMes = (m) => GC.sazonal.NOMES_MES[m];
      const quando = (t) => (t.faltamMeses === 1 ? 'começa no mês que vem' : `começa em ${t.faltamMeses} meses`);
      const linha = (t, sub, cls = '') => `<li class="${cls}"><i class="ti ti-${esc(t.icone)}" aria-hidden="true"></i><span>${esc(t.nome)}<small>${esc(sub)}</small></span>`
        + `<time>${esc(GC.sazonal.periodo(t))}</time></li>`;
      const itens = [
        ...r.curso.map((t) => linha(t, t.pico !== null ? `em curso · pico em ${nomeMes(t.pico)}` : 'em curso', 'tz-curso')),
        ...r.preparo.map((t) => linha(t, `${quando(t)} · ${t.acoes[0] ? t.acoes[0].texto.toLowerCase() : 'preparar'}`)),
      ].slice(0, MAX).join('');
      const principal = r.curso[0] || r.preparo[0];
      const titulo = r.curso.length
        ? `${principal.nome}${principal.pico !== null ? `: pico em ${nomeMes(principal.pico)}` : ' em curso'}${r.atrasadas.length ? `, com ${plural(r.atrasadas.length, 'compromisso de preparo atrasado', 'compromissos de preparo atrasados')}` : ''}`
        : `Hora de preparar: ${principal.nome.toLowerCase()} ${quando(principal)}`;
      const atraso = r.atrasadas.length ? `<ul class="tr-lista tz-atrasadas">${r.atrasadas.slice(0, 2).map((a) => `<li><i class="ti ti-alert-triangle" aria-hidden="true"></i>`
        + `<span>${esc(a.meta.titulo)}<small>a temporada já começou</small></span><time>${a.meta.progressoPct}%</time></li>`).join('')}</ul>` : '';
      return {
        rotulo: 'Época do ano',
        sub: `${GC.sazonal.NOMES_MES[r.s.mes].replace(/^./, (c) => c.toUpperCase())} · calendário sazonal`,
        titulo,
        html: `<ul class="tr-lista tz-lista">${itens}</ul>${atraso}`,
      };
    },
  });
})(window.GC = window.GC || {});
