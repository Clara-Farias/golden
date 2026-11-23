(function (GC) {
  // Bloco "Prazo" no detalhe da ocorrência (spec: docs/specs/2026-11-12-vila-dourada-prazos-fase2-design.md).
  // A pasta pausa, retoma e pede mais prazo; o prefeito aprova ou recusa o pedido. Botões com data-op e
  // formulários com data-op-tipo, ligados pelo GC.ligarOperacao (js/operacao-ui.js); quem executa é o app.
  const esc = (t) => GC.escaparHtml(t);
  const MIN = 60000;
  const tempo = (min) => GC.tempoTexto(Math.max(1, Math.round(min)));
  const ha = (t) => `há ${tempo((GC.agora() - t) / MIN)}`;

  const ERROS = {
    motivo_pausa: 'Escolha o motivo da pausa.',
    texto_pausa: 'Diga o que está faltando.',
    horas: 'Diga quantas horas a mais (até 30 dias).',
    motivo_prazo: 'Diga por que precisa de mais prazo.',
  };
  Object.assign(GC.ERROS_OPERACAO || (GC.ERROS_OPERACAO = {}), ERROS);

  const ESTADO = { automatica: 'valeu na hora', aprovada: 'aprovado pelo prefeito', recusada: 'recusado pelo prefeito', cancelada: 'cancelado' };

  function formularios(o) {
    const id = esc(o.id);
    const livre = (GC.PRORROGACAO_LIVRE_MIN || {})[o.severidade] || 0;
    const usou = (o.prorrogacoes || []).some((p) => p.estado === 'automatica');
    const regra = livre && !usou
      ? `Até ${tempo(livre)} vale na hora (uma vez por ocorrência). Acima disso, o prefeito decide.`
      : 'O prefeito decide. Até lá, vale o prazo de agora.';
    const rodape = (rotulo) => `<p class="cb-erro" role="alert"></p><div class="cb-form-pe"><button type="submit" class="btn-acao principal">${rotulo}</button><button type="button" class="btn-sec" data-op-fechar>Cancelar</button></div>`;
    return `
      <form class="cb-form" data-op-tipo="pausar" data-op-id="${id}" hidden>
        <p class="cb-form-tit">Pausar o prazo: a espera não depende da pasta</p>
        <label class="cb-campo">Motivo<select name="motivoPausa"><option value="">Escolha</option>${Object.entries(GC.MOTIVOS_PAUSA).map(([v, n]) => `<option value="${v}">${esc(n)}</option>`).join('')}</select></label>
        <label class="cb-campo">Detalhe (obrigatório em "Outro motivo")<textarea name="texto" rows="2" maxlength="300" placeholder="Ex.: protocolo 4471 na concessionária de energia"></textarea></label>
        <p class="op-nota">O relógio dos dois prazos para até alguém retomar. Atraso que já existia continua. Pausado há mais de ${tempo(GC.PAUSA_TETO_MIN)}, volta a pedir o prefeito.</p>
        ${rodape('Pausar')}
      </form>
      <form class="cb-form" data-op-tipo="prorrogar" data-op-id="${id}" hidden>
        <p class="cb-form-tit">Pedir mais prazo para ${esc(GC.FASES_PRAZO[GC.faseCorrendo(o)])}</p>
        <label class="cb-campo">Horas a mais<input type="number" name="horas" min="1" max="720" step="1" inputmode="numeric"></label>
        <label class="cb-campo">Por quê<textarea name="motivo" rows="2" maxlength="300"></textarea></label>
        <p class="op-nota">${esc(regra)}</p>
        ${rodape('Pedir')}
      </form>`;
  }

  GC.htmlBlocoPrazo = function (o, perfil = GC.perfil) {
    if (!o || o.status === 'resolvida' || !GC.podeNoPrazo) return '';
    const id = esc(o.id);
    const pode = (a) => GC.podeNoPrazo(a, o, perfil);
    const pa = GC.pausaAtual(o);
    const pedido = GC.prorrogacaoPendente(o);
    const decididas = (o.prorrogacoes || []).filter((p) => p.estado !== 'pendente').slice(-2);
    const linhas = [];
    if (pa) {
      linhas.push(`<p class="pz-frase${GC.pausaLonga(o) ? ' longa' : ''}">⏸ <b>Prazo pausado ${ha(pa.desde)}</b>: ${esc(GC.MOTIVOS_PAUSA[pa.motivo] || pa.motivo)}${pa.texto ? ` · ${esc(pa.texto)}` : ''}${pa.quem ? ` <small>(${esc(pa.quem)})</small>` : ''}</p>`);
    }
    if (pedido) {
      linhas.push(`<p class="pz-frase">⏳ <b>Pediu mais ${tempo(pedido.minutos)}</b> para ${esc(GC.FASES_PRAZO[pedido.fase])} ${ha(pedido.em)}: ${esc(pedido.motivo)}${pedido.quem ? ` <small>(${esc(pedido.quem)})</small>` : ''}</p>
        ${pode('decidir') ? `<div class="cb-botoes"><button type="button" class="btn-acao principal" data-op="aprovar_prazo" data-op-id="${id}">✓ Aprovar</button><button type="button" class="btn-sec" data-op="recusar_prazo" data-op-id="${id}">✕ Recusar</button></div>` : '<p class="op-nota">Aguarda o prefeito. Até lá, vale o prazo de agora.</p>'}`);
    }
    decididas.forEach((p) => linhas.push(`<p class="pz-hist">Mais ${tempo(p.minutos)} para ${esc(GC.FASES_PRAZO[p.fase])}: ${ESTADO[p.estado]}</p>`));
    const botoes = [
      pa && pode('retomar') ? `<button type="button" class="btn-acao principal" data-op="retomar" data-op-id="${id}">▶ Retomar o prazo</button>` : '',
      !pa && pode('pausar') ? `<button type="button" class="btn-sec" data-op-form="pausar" data-op-id="${id}">⏸ Pausar o prazo</button>` : '',
      !pedido && pode('prorrogar') ? `<button type="button" class="btn-sec" data-op-form="prorrogar" data-op-id="${id}">⏳ Pedir mais prazo</button>` : '',
    ].filter(Boolean);
    if (!linhas.length && !botoes.length) return '';
    return `
      <section class="op-bloco pz-bloco" data-op-bloco="pz-${id}">
        <div class="cb-bloco-cab"><h3>⏱ Prazo</h3></div>
        ${linhas.join('')}
        ${botoes.length ? `<div class="cb-botoes">${botoes.join('')}</div>` : ''}
        ${pode('pausar') || pode('prorrogar') ? formularios(o) : ''}
      </section>`;
  };
})(window.GC = window.GC || {});
