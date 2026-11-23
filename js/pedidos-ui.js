(function (GC) {
  // Pedidos do cidadão no painel (js/pedidos.js): o bloco "Relatos dos moradores" no detalhe da ocorrência
  // (js/gaveta.js) com contador, fotos, descrições e, depois de resolvida, as notas. Só lê.
  const esc = (t) => GC.escaparHtml(t);
  const ha = (t) => (GC.haQuanto ? GC.haQuanto(t) : new Date(t).toLocaleString('pt-BR'));
  const MAX_RELATOS = 4;

  GC.htmlBlocoPedidos = function (o) {
    if (!o || !GC.pedidos) return '';
    const p = GC.pedidos.daOcorrencia(o.id);
    if (!p) return '';
    const relatos = GC.pedidos.relatosDe(p.id);
    const fotos = relatos.filter((x) => x.foto).slice(0, 6);
    const textos = relatos.filter((x) => x.descricao).slice(0, MAX_RELATOS);
    const notas = relatos.filter((x) => x.avaliacao);
    const media = notas.length ? notas.reduce((s, x) => s + x.avaliacao.nota, 0) / notas.length : null;
    return `<section class="pd-bloco">
        <div class="cb-bloco-cab"><h3>💬 Relatos dos moradores</h3><span class="pd-contador">${p.relatos} ${p.relatos > 1 ? 'relatos' : 'relato'}</span></div>
        <p class="op-nota">Pedidos feitos pelo Portal do Cidadão. Cada morador acompanha pelo protocolo e vê a situação que esta ocorrência tiver${o.status !== 'resolvida' ? '; ao resolver, a descrição e a foto do que foi feito aparecem para eles' : ''}.</p>
        ${fotos.length ? `<div class="pd-fotos">${fotos.map((x) => `<img src="${esc(x.foto)}" alt="Foto enviada por morador, protocolo ${esc(x.protocolo)}" loading="lazy">`).join('')}</div>` : ''}
        ${textos.length ? `<ul class="pd-relatos">${textos.map((x) => `<li><p>“${esc(x.descricao)}”</p><small>Protocolo ${esc(x.protocolo)} · ${esc(ha(x.criadoEm))}</small></li>`).join('')}</ul>` : ''}
        ${media !== null ? `<p class="pd-notas">Avaliação dos moradores: <b>${media.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} de 5</b> (${notas.length} ${notas.length > 1 ? 'notas' : 'nota'})${notas.some((x) => x.avaliacao.comentario) ? ` · “${esc(notas.find((x) => x.avaliacao.comentario).avaliacao.comentario)}”` : ''}</p>` : ''}
      </section>`;
  };

  // No formulário de "Marcar como resolvida": avisa que o morador vai ver o texto e a foto.
  GC.temPedidoDeMorador = (o) => !!(o && GC.pedidos && GC.pedidos.daOcorrencia(o.id));
})(window.GC = window.GC || {});
