(function (GC) {
  // Conteúdo do widget (HTML puro, sem estado): js/widgets.js chama GC.conteudoWidget.sazonal(dados do painel, opções).
  // Calendário sazonal (js/data-sazonal.js): a faixa dos próximos 12 meses, o que está em curso, o que preparar
  // agora (com as metas do plano) e o que vem depois.
  const { esc, plural } = GC.widgetUtil;

  GC.registrarWidget({ id: 'sazonal', ordem: 370, nome: 'Calendário sazonal', emoji: '📅', icone: 'calendar-month', categoria: 'gestao', descricao: 'As épocas do ano (chuvas, dengue, volta às aulas…), o que preparar agora e os compromissos de preparo atrasados' });

  const ic = (nome, cls) => GC.icone(nome, cls);
  const nomeArea = (id) => ((GC.data.areas || []).find((a) => a.id === id) || { nome: id }).nome;
  const quando = (t) => (t.faltamMeses === 1 ? 'no mês que vem' : `em ${t.faltamMeses} meses`);

  // Uma linha por temporada, 12 colunas a partir do mês de hoje.
  function faixa(s) {
    const meses = Array.from({ length: 12 }, (_, k) => (s.mes + k) % 12);
    const cab = meses.map((m, k) => `<span class="${k === 0 ? 'hoje' : ''}">${GC.sazonal.CURTOS[m]}</span>`).join('');
    const linhas = s.todas.map((t) => {
      const celulas = meses.map((m, k) => {
        const em = t.meses.includes(m);
        const cls = [em ? 'em' : t.preparo.includes(m) ? 'prep' : '', m === t.pico ? 'pico' : '', k === 0 ? 'hoje' : ''].filter(Boolean).join(' ');
        const i = em && t.intensidade ? t.intensidade[m] : 1;
        return `<i class="${cls}"${em ? ` style="--i:${i}"` : ''}></i>`;
      }).join('');
      const leitura = `${t.nome}: ${GC.sazonal.periodo(t)}${t.pico !== null ? `, pico em ${GC.sazonal.NOMES_MES[t.pico]}` : ''}; preparar ${plural(t.preparo.length, 'mês', 'meses')} antes`;
      return `<li title="${esc(leitura)}"><span class="nome">${ic(t.icone)} ${esc(t.nome)}</span><span class="cel" aria-hidden="true">${celulas}</span><span class="sr-only">${esc(leitura)}</span></li>`;
    }).join('');
    return `<div class="w-saz-faixa">
      <div class="w-saz-cab" aria-hidden="true"><span></span><span class="cel">${cab}</span></div>
      <ul>${linhas}</ul>
      <p class="w-saz-legenda" aria-hidden="true"><i class="em"></i>temporada <i class="em pico"></i>pico <i class="prep"></i>preparar</p>
    </div>`;
  }

  const meta = (m) => `<span class="w-saz-meta ${m.concluida ? 'ok' : m.atrasada ? 'atrasada' : ''}"><b>${m.progressoPct}%</b> ${m.concluida ? 'concluído' : m.atrasada ? 'atrasado' : `prazo ${esc(m.prazo)}`}</span>`;
  const acoes = (t) => `<ul class="w-saz-acoes">${t.acoes.map((a) => `<li>${esc(a.texto)}${a.meta ? meta(a.meta) : ''}</li>`).join('')}</ul>`;
  const verMapa = (t) => (t.camada ? `<button type="button" class="btn-sec" data-camada="${esc(t.camada)}">${ic('map-pin')} Ver no mapa</button>` : '');

  function cartao(t, rotulo) {
    const pico = t.pico !== null ? ` · pico em ${GC.sazonal.NOMES_MES[t.pico]}` : '';
    return `<article class="w-saz-item ${t.situacao}">
      <header><span class="w-saz-tag">${esc(rotulo)}</span><b>${ic(t.icone)} ${esc(t.nome)}</b>
        <small>${esc(nomeArea(t.area))} · ${esc(GC.sazonal.periodo(t))}${esc(pico)} · ${esc(t.porque)}</small></header>
      ${acoes(t)}
      ${verMapa(t)}
    </article>`;
  }

  function sazonal(s) {
    if (!s) return '';
    const n = s.atrasadas.length;
    const alerta = n ? `<div class="w-saz-alerta">${ic('alert-triangle', 'ic-alerta')}<div><b>${plural(n, 'compromisso de preparo atrasado', 'compromissos de preparo atrasados')}</b>
        <small>${s.atrasadas.map((a) => `${esc(a.meta.titulo)} (${a.meta.progressoPct}%)`).join(' · ')}: a temporada já começou.</small></div></div>` : '';
    const emCurso = s.emCurso.map((t) => cartao(t, t.situacao === 'pico' ? 'No pico' : 'Em curso')).join('');
    const preparo = s.emPreparo.map((t) => cartao(t, `Começa ${quando(t)}`)).join('');
    const depois = s.proximas.length ? `<p class="w-saz-depois">Depois: ${s.proximas.map((t) => `<b>${esc(t.nome)}</b> ${quando(t)}`).join(' · ')}</p>` : '';
    return `<div class="w-saz">
      <p class="w-saz-mes">${ic('calendar-month')} <b>${esc(s.nomeMes[0].toUpperCase() + s.nomeMes.slice(1))}</b>
        · ${plural(s.emCurso.length, 'temporada em curso', 'temporadas em curso')} · ${s.emPreparo.length} para preparar agora</p>
      ${alerta}
      ${faixa(s)}
      <div class="w-saz-colunas">
        <section><h4>Em curso</h4>${emCurso || '<p class="w-saz-vazio">Nenhuma temporada agora.</p>'}</section>
        <section><h4>Preparar agora</h4>${preparo || '<p class="w-saz-vazio">Nada para preparar este mês.</p>'}${depois}</section>
      </div>
      <a class="w-saz-abrir" href="#/sazonal">Abrir o calendário do ano →</a>
    </div>`;
  }

  // Peças que a tela #/sazonal (js/tela-sazonal.js) reaproveita.
  GC.sazonalUi = { cartao, meta, nomeArea, quando };

  GC.conteudoWidget.sazonal = () => (GC.sazonal ? sazonal(GC.sazonal.agora()) : '');

  // ---- Versão pública (embed.html): "Fique atento neste mês", as mesmas dicas do Portal do Cidadão
  // (GC.sazonal.paraCidadao). Sem ações nem metas da Prefeitura.
  function sazonalPublico() {
    const ic = GC.widgetUtil.ic; // sem js/icones.js (testes), o ícone some em vez de quebrar
    const s = GC.sazonal.agora();
    const dicas = GC.sazonal.paraCidadao();
    const mes = s.nomeMes[0].toUpperCase() + s.nomeMes.slice(1);
    const bloco = (lista, titulo) => (lista.length ? `<h3>${titulo}</h3><ul class="vp-epocas">${lista.map((t) => `<li>${ic(t.icone)}<span><b>${esc(t.nome)}</b> <small>${esc(t.quando)}</small>
        <span>${esc(t.dica)}</span></span></li>`).join('')}</ul>` : '');
    const depois = s.proximas.length ? `<p class="vp-fonte">Depois: ${s.proximas.map((t) => `${esc(t.nome)} ${esc(quando(t))}`).join(' · ')}.</p>` : '';
    return `<div class="vp-sazonal">
      ${dicas.length ? '' : `<p class="vp-vazio">${ic('calendar-month')} Nada especial para ${esc(s.nomeMes)}.</p>`}
      ${bloco(dicas.filter((t) => t.agora), `Agora, em ${esc(mes.toLowerCase())}`)}
      ${bloco(dicas.filter((t) => !t.agora), 'Está chegando')}
      ${depois}
    </div>`;
  }
  GC.conteudoPublico.sazonal = {
    nome: 'Fique atento neste mês',
    descricao: 'O que a época do ano traz (chuvas, dengue, vacina…) e o que fazer',
    montar: sazonalPublico,
  };
})(window.GC = window.GC || {});
