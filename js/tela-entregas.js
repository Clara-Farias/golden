(function (GC) {
  // Tela "Agenda de entregas" (#/entregas[/<aaaa-mm>][/pasta:<id>][/bairro:<id>][/ver:<lista>][/sit:<situação>]).
  // É uma agenda: o que vamos entregar e quando. Linha do tempo em cima e UMA lista embaixo (o mês olhado, os
  // próximos 90 dias, as fora do prazo ou as entregues no ano), com botões de situação. Cobrar e acompanhar o que dá
  // errado fica na Central de alertas: a ficha só aponta para o alerta aberto da obra. Ao lado, a ficha da entrega
  // escolhida ou, sem escolha, as inaugurações marcadas e as datas confirmadas. No celular, a ficha é uma folha.
  // O motor é js/data-entregas.js (o mesmo do widget); aqui é só o desenho.
  // Spec: docs/specs/2026-11-12-vila-dourada-agenda-de-entregas-design.md.
  const esc = (t) => GC.escaparHtml(t);
  const ic = (nome, cls) => GC.icone(nome, cls);
  const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
  const maiuscula = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const nomeBairro = (id) => (GC.data.bairros.find((b) => b.id === id) || { nome: id }).nome;

  const chaveMes = (iso) => iso.slice(0, 7);
  // Mês aaaa-mm deslocado n meses.
  function somarMes(chave, n) {
    const t = +chave.slice(0, 4) * 12 + (+chave.slice(5, 7) - 1) + n;
    return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
  }
  const mesesEntre = (de, ate) => (+ate.slice(0, 4) * 12 + +ate.slice(5, 7)) - (+de.slice(0, 4) * 12 + +de.slice(5, 7));
  const diasEntre = (de, ate) => Math.round((Date.UTC(+ate.slice(0, 4), +ate.slice(5, 7) - 1, +ate.slice(8, 10)) - Date.UTC(+de.slice(0, 4), +de.slice(5, 7) - 1, +de.slice(8, 10))) / 86400000);
  const nomeMes = (chave) => `${GC.entregas.MESES[+chave.slice(5, 7) - 1]} de ${chave.slice(0, 4)}`;
  const curtoMes = (chave) => GC.entregas.CURTOS[+chave.slice(5, 7) - 1];
  const celular = () => !!(window.matchMedia && window.matchMedia('(max-width: 720px)').matches);

  // Rota → mês olhado (aaaa-mm); sem mês ou mês inválido, o de hoje.
  GC.mesDaRotaEntregas = (rota) => (rota && /^\d{4}-(0[1-9]|1[0-2])$/.test(rota.mes || '') ? rota.mes : chaveMes(GC.relogio.hoje));

  const ORDEM_SIT = ['entregue', 'no_prazo', 'em_risco', 'atrasada', 'parada'];
  // "1 entregue", "2 atrasadas", "3 no prazo".
  const PLURAIS = { entregue: ['entregue', 'entregues'], no_prazo: ['no prazo', 'no prazo'], em_risco: ['em risco', 'em risco'], atrasada: ['atrasada', 'atrasadas'], parada: ['parada', 'paradas'] };
  // Fora do prazo = atrasada, parada ou em risco (a data prevista não é confiável).
  const FORA = ['parada', 'atrasada', 'em_risco'];
  const grupoSit = (s) => (FORA.includes(s) ? 'fora' : s);
  // Listas da agenda (/ver:<id>); sem ver, o mês olhado. Os links antigos (ver:atrasada…) caem em "fora".
  const LISTAS = ['proximas', 'fora', 'entregues'];
  const lerVer = (v) => (LISTAS.includes(v) ? v : FORA.includes(v) ? 'fora' : null);
  // Botões de situação acima da lista (/sit:<id>).
  const SITS = [['', 'Todas'], ['no_prazo', 'No prazo'], ['fora', 'Fora do prazo'], ['entregue', 'Entregues']];

  // Mensagens do registro (js/entregas-registro.js) em palavras.
  const ERROS = {
    permissao: 'Você não tem permissão para isso nesta entrega.', data: 'Escolha uma data de hoje em diante.',
    mesma_data: 'A nova data é igual à de agora.', motivo: 'Escolha o motivo.', texto: 'Conte o motivo em poucas palavras.',
    hora: 'Escolha a hora.', local: 'Diga o local.', entregue: 'Esta entrega já foi feita.', sem_data: 'Esta entrega não tem data para remarcar.',
  };
  const dataBr = (iso) => iso.split('-').reverse().join('/');

  // O número que resume a situação, para bater o olho: "77 dias sem avanço", "+2 meses", "16 pontos abaixo", "em 12 dias".
  function marca(e) {
    if (e.situacao === 'parada') return `${plural(e.semAvancoDias, 'dia', 'dias')} sem avanço`;
    if (e.situacao === 'atrasada') {
      if (e.remarcada) {
        const m = mesesEntre(e.dataOriginal, e.dataAtual);
        return m > 0 ? `+${plural(m, 'mês', 'meses')}` : `+${plural(diasEntre(e.dataOriginal, e.dataAtual), 'dia', 'dias')}`;
      }
      return e.diasParaEntrega < 0 ? `${plural(-e.diasParaEntrega, 'dia', 'dias')} de atraso` : GC.entregas.quando(e);
    }
    if (e.situacao === 'em_risco' && e.esperadoPct !== null) return `${plural(e.esperadoPct - e.avancoPct, 'ponto', 'pontos')} abaixo`;
    return GC.entregas.quando(e);
  }

  // pode(acao, entrega) e aoAgir(acao, id, dados) vêm do js/app/telas.js (permissão e auditoria);
  // alertaDe(entrega) devolve o alerta aberto da obra (ou null) e aoAbrirAlerta(id) abre o detalhe dele.
  GC.criarTelaEntregas = function (el, {
    aoIr = () => {}, aoVerObra = () => {}, pode = () => false, aoAgir = () => ({ ok: false, motivo: 'permissao' }),
    alertaDe = () => null, aoAbrirAlerta = () => {}, aoRelatorio = () => {},
  } = {}) {
    let form = null; // 'remarcar' | 'inaugurar' | null: o formulário aberto na ficha
    let aviso = null; // { ok, texto } depois de uma ação
    let rota = { tela: 'entregas' };
    let ctx = { areas: null };
    let filtroArea = '';
    let filtroBairro = '';
    let ver = null; // LISTAS ou null (o mês olhado)
    let sit = ''; // '' | 'no_prazo' | 'fora' | 'entregue'
    let sel = null; // id da entrega aberta na ficha; sem ela, a coluna mostra inaugurações e datas confirmadas
    let inicial = true; // na primeira vez, o setor começa na própria pasta
    let refocar = null; // seletor que recebe o foco depois do redesenho (a rota redesenha a tela inteira)
    let rolarLista = false;
    let rolagemAntes = null; // posição da tela antes de uma troca de rota feita aqui dentro

    // Muda a rota com os filtros de agora (o link guarda o recorte).
    function ir(mudanca, foco) {
      const mesHoje = chaveMes(GC.relogio.hoje);
      const r = Object.assign({ mes: GC.mesDaRotaEntregas(rota), pasta: filtroArea, bairro: filtroBairro, ver, sit }, mudanca);
      refocar = foco || null;
      // A troca de rota leva a tela ao topo (js/app/telas.js); dentro da agenda, a posição volta depois do desenho.
      const nova = { tela: 'entregas', mes: r.mes && r.mes !== mesHoje ? r.mes : null, pasta: r.pasta || null, bairro: r.bairro || null, ver: r.ver || null, sit: r.sit || null };
      // Mesma rota (ex.: "Este mês" já no mês de hoje): nada navega, só redesenha aqui.
      if (GC.hashDe && GC.hashDe(nova) === GC.hashDe(Object.assign({ tela: 'entregas' }, rota))) { rolagemAntes = null; return desenhar(); }
      rolagemAntes = el.scrollTop;
      aoIr(nova);
    }

    function desenhar() {
      const { etiqueta, onde, nomeArea } = GC.entregasUi;
      const hoje = GC.relogio.hoje;
      const mesHoje = chaveMes(hoje);
      const mes = GC.mesDaRotaEntregas(rota);
      const minhas = ctx.areas || null; // setor: as outras pastas aparecem marcadas como "outra pasta"
      const daPasta = (e) => !minhas || minhas.includes(e.area);
      const r = GC.entregas.resumo({ area: filtroArea || null, bairro: filtroBairro || null });
      const todas = r.todas;
      const anoHoje = hoje.slice(0, 4);
      const fora = r.atencao; // parada, atrasada e em risco, da mais grave para a menos grave

      // ---- linha do tempo: seis meses para trás, seis para a frente (e o mês olhado, se estiver fora) ----
      // A janela acompanha o mês escolhido (seis antes, seis depois): navegar pelo mês e ano leva a linha junto.
      const meses = Array.from({ length: 13 }, (_, k) => somarMes(mes, k - 6));
      // Entregues: as do ano do mês escolhido (assim dá para olhar anos anteriores).
      const anoVer = mes.slice(0, 4);
      const entreguesAno = todas.filter((e) => e.situacao === 'entregue' && e.dataAtual.slice(0, 4) === anoVer);
      // Anos que a escolha oferece: da entrega mais antiga à mais distante (com o ano de hoje e o escolhido).
      const datas = GC.entregas.lista().map((e) => e.dataAtual).sort();
      const anoMin = Math.min(+anoHoje, +anoVer, datas.length ? +datas[0].slice(0, 4) : +anoHoje);
      const anoMax = Math.max(+anoHoje, +anoVer, datas.length ? +datas[datas.length - 1].slice(0, 4) : +anoHoje);
      const navMes = `<div class="en-nav-mes" role="group" aria-label="Escolher o mês">
          <button type="button" class="en-nav" data-ent-mes="${somarMes(mes, -1)}" data-ent-nav="ant" aria-label="Mês anterior" title="Mês anterior">${ic('chevron-left')}</button>
          <select data-ent-escolha="mes" aria-label="Mês">${GC.entregas.MESES.map((n, i) => `<option value="${String(i + 1).padStart(2, '0')}"${i + 1 === +mes.slice(5, 7) ? ' selected' : ''}>${maiuscula(n)}</option>`).join('')}</select>
          <select data-ent-escolha="ano" aria-label="Ano">${Array.from({ length: anoMax - anoMin + 1 }, (_, i) => anoMin + i).map((a) => `<option value="${a}"${String(a) === anoVer ? ' selected' : ''}>${a}</option>`).join('')}</select>
          <button type="button" class="en-nav" data-ent-mes="${somarMes(mes, 1)}" data-ent-nav="prox" aria-label="Próximo mês" title="Próximo mês">${ic('chevron-right')}</button>
          ${mes !== mesHoje ? `<button type="button" class="btn-sec en-ir-hoje" data-ent-mes="${mesHoje}" data-ent-nav="hoje">Hoje</button>` : ''}
        </div>`;
      const doMes = (m) => todas.filter((e) => chaveMes(e.dataAtual) === m);
      const maxMes = Math.max(1, ...meses.map((m) => doMes(m).length));
      const ALTURA = 64; // px da barra mais alta (poucas entregas por mês: a altura serve só para comparar)
      // Partes da barra: uma por situação; as remarcadas (na data nova) vêm listradas.
      const partesMes = (lista) => {
        const p = [];
        ORDEM_SIT.forEach((s) => {
          const l = lista.filter((e) => e.situacao === s);
          if (!l.length) return;
          const rem = l.filter((e) => e.remarcada).length;
          if (l.length - rem) p.push([s, l.length - rem]);
          if (rem) p.push([`${s} remarcada`, rem]);
        });
        return p;
      };
      const linhaTempo = meses.map((m) => {
        const lista = doMes(m);
        const contagem = ORDEM_SIT.map((s) => [s, lista.filter((e) => e.situacao === s).length]).filter(([, n]) => n);
        const rem = lista.filter((e) => e.remarcada).length;
        const leitura = `${nomeMes(m)}: ${plural(lista.length, 'entrega', 'entregas')}${contagem.length ? ` (${contagem.map(([s, n]) => plural(n, ...PLURAIS[s])).join(', ')}${rem ? `; ${plural(rem, 'remarcada', 'remarcadas')} para este mês` : ''})` : ''}`;
        const altura = lista.length ? Math.max(10, Math.round((lista.length / maxMes) * ALTURA)) : 0;
        const olhado = !ver && m === mes;
        return `<button type="button" class="en-mes${olhado ? ' olhado' : ''}${m === mesHoje ? ' hoje' : ''}${m < mesHoje ? ' passado' : ''}" data-ent-mes="${m}" aria-pressed="${olhado}" tabindex="${m === mes ? 0 : -1}" title="${esc(leitura)}" aria-label="${esc(leitura)}">
          <span class="en-col-barra" aria-hidden="true"><b>${lista.length || ''}</b><span class="en-barra" style="height:${altura}px">${partesMes(lista).map(([s, n]) => `<i class="${s}" style="flex:${n}"></i>`).join('')}</span></span>
          <i class="en-rota" aria-hidden="true"></i>
          <span class="en-mes-nome" aria-hidden="true">${curtoMes(m)}${m.slice(5, 7) === '01' || m === meses[0] ? `<small>${m.slice(0, 4)}</small>` : ''}${m === mesHoje ? '<small class="en-hoje">hoje</small>' : ''}</span>
        </button>`;
      }).join('');
      // A escala de cores é a situação; "remarcada" é um detalhe da barra, então fica à parte, como nota.
      const legenda = `${ORDEM_SIT.map((s) => `<span><i class="${s}"></i>${esc(GC.entregas.ROTULOS[s].toLowerCase())}</span>`).join('')}<span class="en-leg-nota"><i class="no_prazo remarcada"></i>listras: remarcada, na data nova</span>`;

      // Barrinha do avanço na linha (só obra aberta com avanço): o mesmo dado da ficha, para bater o olho.
      const miniAvanco = (e) => (e.situacao !== 'entregue' && typeof e.avancoPct === 'number'
        ? `<span class="en-mini ${e.situacao}" aria-hidden="true" title="${e.avancoPct}% feito"><i style="width:${Math.min(100, e.avancoPct)}%"></i></span>` : '');
      // ---- uma entrega na lista: selo da data, título, pasta e bairro, etiqueta e o número da situação ----
      const selo = (iso) => `<span class="en-dia" aria-hidden="true"><b>${+iso.slice(8, 10)}</b><small>${curtoMes(iso)}${iso.slice(0, 4) !== anoHoje ? ` ${iso.slice(2, 4)}` : ''}</small></span>`;
      const botaoEntrega = (e, { data = e.dataAtual, sub, fim } = {}) => `<li><button type="button" class="en-item${e.id === sel ? ' sel' : ''}" data-ent-id="${esc(e.id)}" aria-pressed="${e.id === sel}">
          ${selo(data)}
          <span class="nome"><span class="en-vh">${esc(GC.entregas.diaMes(data))} de ${data.slice(0, 4)}: </span>${esc(e.titulo)}
            <small>${sub || `${esc(nomeArea(e.area))} · ${esc(onde(e))}${daPasta(e) ? '' : ' <em class="en-outra">outra pasta</em>'}`}</small></span>
          ${fim === undefined ? `<span class="en-item-fim">${etiqueta(e)}<small>${esc(marca(e))}</small>${miniAvanco(e)}</span>` : fim}</button></li>`;
      const vazio = (icone, texto) => `<p class="en-vazio">${ic(icone)} ${texto}</p>`;

      // ---- a lista: a escolhida (mês, próximas, fora do prazo, entregues) e, nela, os botões de situação ----
      const base = ver === 'proximas' ? r.proximas90 : ver === 'fora' ? fora : ver === 'entregues' ? entreguesAno.slice().reverse() : doMes(mes);
      const comSit = !ver || ver === 'proximas';
      const contaSit = (s) => (s ? base.filter((e) => grupoSit(e.situacao) === s).length : base.length);
      const sitValida = comSit ? sit : ''; // a escolhida vale mesmo com zero (o botão não some de baixo de quem clicou)
      const lista = sitValida ? base.filter((e) => grupoSit(e.situacao) === sitValida) : base;
      const botoesSit = comSit && base.length ? `<div class="en-sits" role="group" aria-label="Situação">
          ${SITS.map(([id, nome]) => { const n = contaSit(id); return `<button type="button" class="en-sit${id === sitValida ? ' ativo' : ''}${id ? ` ${id}` : ''}" data-ent-sit="${id}" aria-pressed="${id === sitValida}"${n || id === sitValida ? '' : ' disabled'}>${nome} <small>${n}</small></button>`; }).join('')}
        </div>` : '';
      const TITULOS = {
        null: [maiuscula(nomeMes(mes)), plural(base.length, 'entrega', 'entregas')],
        proximas: ['Próximos 90 dias', `${plural(base.length, 'entrega prevista', 'entregas previstas')}, pela data`],
        fora: ['Fora do prazo', `${plural(base.length, 'entrega', 'entregas')} atrasadas, paradas ou em risco, da mais grave para a menos grave`],
        entregues: [`Entregues em ${anoVer}`, 'da mais recente para a mais antiga · troque o ano na linha do tempo'],
      };
      const [titulo, sub] = TITULOS[ver];
      const volta = ver ? `<button type="button" class="en-link" data-ent-mes="${mes}">voltar para ${esc(nomeMes(mes))}</button>`
        : mes !== mesHoje ? `<button type="button" class="en-link" data-ent-mes="${mesHoje}">voltar para este mês</button>` : '';
      const textoVazio = sitValida ? `Nenhuma entrega ${sitValida === 'fora' ? 'fora do prazo' : PLURAIS[sitValida][0]} aqui.`
        : ver === 'proximas' ? 'Nenhuma entrega prevista nos próximos 90 dias neste recorte.'
          : ver === 'fora' ? 'Nenhuma entrega fora do prazo neste recorte.'
            : ver === 'entregues' ? `Nenhuma entrega feita em ${anoVer} neste recorte.`
              : `Nenhuma entrega em ${esc(nomeMes(mes))}${filtroArea || filtroBairro ? ' neste recorte' : ''}.`;
      // Lista pela data (o mês e os próximos 90 dias) separada por semana, como numa agenda. As outras (fora do prazo,
      // pela gravidade; entregues, da mais recente) ficam numa lista só. Com um grupo só, sem cabeçalho.
      const diaSemanaHoje = new Date(Date.UTC(+hoje.slice(0, 4), +hoje.slice(5, 7) - 1, +hoje.slice(8, 10))).getUTCDay();
      const ateDomingo = (7 - diaSemanaHoje) % 7; // dias de hoje até o domingo desta semana
      const semanaDe = (e) => {
        const d = diasEntre(hoje, e.dataAtual);
        return d < 0 ? 'Antes de hoje' : d <= ateDomingo ? 'Esta semana' : d <= ateDomingo + 7 ? 'Semana que vem' : 'Mais adiante';
      };
      function listaPorSemana(itens, pelaData) {
        const grupos = [];
        if (pelaData) itens.forEach((e) => { const g = semanaDe(e); const ult = grupos[grupos.length - 1]; if (ult && ult.nome === g) ult.itens.push(e); else grupos.push({ nome: g, itens: [e] }); });
        if (grupos.length < 2) return `<ul class="en-lista">${itens.map((e) => botaoEntrega(e)).join('')}</ul>`;
        return grupos.map((g) => `<h4 class="en-semana">${esc(g.nome)} <small>${g.itens.length}</small></h4><ul class="en-lista">${g.itens.map((e) => botaoEntrega(e)).join('')}</ul>`).join('');
      }
      const cartaoLista = `<section class="rel-cartao en-cartao-lista" id="en-lista-cartao">
          <h3>${esc(titulo)} <small>${esc(sub)}${volta ? ` · ${volta}` : ''}</small></h3>
          ${botoesSit}
          ${lista.length ? listaPorSemana(lista, comSit) : vazio(ver === 'fora' || sitValida === 'fora' ? 'circle-check' : 'calendar', textoVazio)}
        </section>`;

      // ---- coluna da direita: a ficha da escolhida, senão inaugurações marcadas e datas confirmadas ----
      if (sel && !todas.some((e) => e.id === sel)) sel = null;
      const f = sel ? todas.find((e) => e.id === sel) : null;
      let lado;
      if (f) lado = fichaDe(f, { etiqueta, onde, nomeArea, hoje });
      else {
        const reg = (e) => e.registro || {};
        const inaug = todas.filter((e) => reg(e).inauguracao && reg(e).inauguracao.dia >= hoje)
          .sort((a, b) => reg(a).inauguracao.dia.localeCompare(reg(b).inauguracao.dia));
        const confirmadas = todas.filter((e) => e.situacao !== 'entregue' && reg(e).confirmada && e.dataAtual >= hoje && !reg(e).inauguracao).slice(0, 6);
        const proxima = r.proximas30.filter((e) => !reg(e).confirmada)[0];
        // O que vence logo é o que o gestor procura ao abrir a agenda: vem primeiro, sempre com conteúdo.
        const LIMITE_VENCE = 5;
        const vence = r.proximas30.slice(0, LIMITE_VENCE);
        const resto = r.proximas30.length - vence.length;
        const cartaoVence = `<section class="rel-cartao en-vence">
              <h3>${ic('hourglass')} Vence nos próximos 30 dias <small>${r.proximas30.length || 'nada'}</small></h3>
              ${vence.length ? `<ul class="en-lista en-lista-curta">${vence.map((e) => botaoEntrega(e)).join('')}</ul>
                ${resto > 0 ? `<button type="button" class="en-link en-mais" data-ent-ver="proximas">e mais ${plural(resto, 'entrega', 'entregas')} · ver os próximos 90 dias</button>` : ''}`
                : vazio('circle-check', 'Nada previsto para os próximos 30 dias neste recorte.')}
            </section>`;
        // Inaugurações e datas confirmadas num cartão só; sem nenhuma, uma linha (dois cartões de "nenhuma" só ocupam lugar).
        const marcadas = inaug.length || confirmadas.length;
        const cartaoMarcadas = `<section class="rel-cartao en-marcadas">
              <h3>${ic('calendar-check')} Datas marcadas <small>${marcadas ? plural(inaug.length + confirmadas.length, 'data', 'datas') : 'nenhuma ainda'}</small></h3>
              ${inaug.length ? `<h4>${ic('confetti')} Inaugurações</h4><ul class="en-lista en-lista-curta">${inaug.map((e) => botaoEntrega(e, { data: reg(e).inauguracao.dia, sub: `às ${esc(reg(e).inauguracao.hora)} · ${esc(reg(e).inauguracao.local)}`, fim: '' })).join('')}</ul>` : ''}
              ${confirmadas.length ? `<h4>${ic('calendar-check')} Confirmadas pela secretaria</h4><ul class="en-lista en-lista-curta">${confirmadas.map((e) => botaoEntrega(e, { fim: `<span class="en-item-fim"><small>${esc(GC.entregas.quando(e))}</small></span>` })).join('')}</ul>` : ''}
              ${marcadas ? '' : '<p class="en-vazio-linha">Nenhuma inauguração marcada nem data confirmada. Abra uma entrega para confirmar a data ou marcar a inauguração.</p>'}
              ${proxima ? `<p class="en-dica">${ic('info-circle')} A próxima sem confirmação é <button type="button" class="en-link" data-ent-id="${esc(proxima.id)}">${esc(proxima.titulo)}</button>, ${esc(GC.entregas.quando(proxima))}.</p>` : ''}
            </section>`;
        lado = `<aside class="en-lado" aria-label="Vence logo e datas marcadas">
            ${cartaoVence}
            ${cartaoMarcadas}
            <p class="en-dica">Escolha uma entrega para ver a ficha.</p>
          </aside>`;
      }

      // ---- filtros ----
      const areas = (GC.data.areas || []).slice().sort((a, b) => (minhas ? (minhas.includes(b.id) - minhas.includes(a.id)) : 0));
      const bairros = [...new Set(GC.entregas.lista().map((e) => e.bairroId).filter(Boolean))]
        .map((id) => ({ id, nome: nomeBairro(id) })).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
      const opcao = (v, nome, atual) => `<option value="${esc(v)}"${v === atual ? ' selected' : ''}>${esc(nome)}</option>`;
      const algumFiltro = filtroArea || filtroBairro || ver || sit;
      // Barra presa no topo: o recorte (pasta, bairro) e o mês olhado, juntos.
      const filtros = `<div class="en-barra-filtros">
        <div class="en-filtros" role="group" aria-label="Recorte da agenda">
          <label>Pasta <select data-ent-filtro="pasta">${opcao('', 'Todas as pastas', filtroArea)}${areas.map((a) => opcao(a.id, `${a.nome}${minhas && minhas.includes(a.id) ? ' (sua pasta)' : ''}`, filtroArea)).join('')}</select></label>
          <label>Bairro <select data-ent-filtro="bairro">${opcao('', 'Toda a cidade', filtroBairro)}${bairros.map((b) => opcao(b.id, b.nome, filtroBairro)).join('')}</select></label>
          ${algumFiltro ? `<button type="button" class="btn-sec en-limpar" data-ent-limpar>${ic('x')} Limpar filtros</button>` : ''}
        </div>
        ${navMes}
      </div>`;

      // ---- números: cada um abre a lista dele ----
      const esteMes = doMes(mesHoje);
      const kpi = (id, ativo, rotulo, n, texto, cls = '') => `<button type="button" class="en-kpi ${cls}${ativo ? ' ativo' : ''}" data-ent-ver="${id}" aria-pressed="${ativo}" aria-controls="en-lista-cartao">
          <small>${rotulo}</small><b>${n}</b><span>${texto}</span></button>`;
      // Quem olha a cidade inteira cobra o que atrasou: "Fora do prazo" vem primeiro. A pasta segue a ordem da agenda.
      const kpiFora = kpi('fora', ver === 'fora', 'Fora do prazo', fora.length, fora.length ? `${[['atrasada', r.atrasadas], ['parada', r.paradas], ['em_risco', r.emRisco]].filter(([, l]) => l.length).map(([s, l]) => plural(l.length, ...PLURAIS[s])).join(' · ')}` : 'todas no prazo', fora.length ? 'ruim' : 'bom');

      el.innerHTML = `
        <header class="sec-topo en-topo">
          <div>
            <h2>${ic('package')} Agenda de entregas</h2>
            <p>O que a prefeitura vai entregar, quando, e o que já entregou.</p>
            <details class="en-ajuda"><summary>${ic('info-circle')} De onde vêm estes dados</summary>
              <p>As obras vêm da tela de obras, com a mesma data, avanço e situação. Serviços e programas vêm do plano de cada secretaria. "Fora do prazo" junta as atrasadas, as paradas e as em risco (o feito mais de ${GC.entregas.LIMITE_RISCO_PP} pontos abaixo do esperado pelo tempo que passou; essa conta não aparece no site da Prefeitura). Cobrar e acompanhar o que atrasou fica na Central de alertas.</p>
            </details>
          </div>
          <span class="en-topo-acoes"><button type="button" class="btn-sec" data-ent-relatorio aria-label="${minhas ? 'Relatório da pasta' : 'Relatório de entregas'}" title="${minhas ? 'Relatório da sua pasta, com a seção de entregas' : 'Relatório de entregas com o recorte desta tela (pasta e bairro), para baixar em PDF, Word ou Excel'}">${ic('file-text')} <span class="en-rot">${minhas ? 'Relatório da pasta' : 'Relatório de entregas'}</span></button><button type="button" class="btn-sec btn-maia-tela" data-maia="O que vamos entregar nos próximos 30 dias?" aria-label="Próximas entregas, com a Maia" title="Próximas entregas, com a Maia"><i class="ti ti-sparkles" aria-hidden="true"></i> <span class="en-rot">Próximas entregas, com a Maia</span></button></span>
        </header>
        ${filtros}
        <div class="en-kpis" role="group" aria-label="Números do recorte: escolha um para ver a lista">
          ${minhas ? '' : kpiFora}
          ${kpi('mes', !ver && mes === mesHoje, 'Este mês', esteMes.length, `${plural(esteMes.filter((e) => e.situacao === 'entregue').length, 'já entregue', 'já entregues')}`)}
          ${kpi('proximas', ver === 'proximas', 'Próximos 90 dias', r.proximas90.length, `${r.proximas30.length} nos próximos 30`)}
          ${minhas ? kpiFora : ''}
          ${kpi('entregues', ver === 'entregues', `Entregues em ${anoVer}`, entreguesAno.length, anoVer === anoHoje ? `até ${esc(GC.entregas.diaMes(hoje))}` : anoVer < anoHoje ? 'no ano todo' : 'até agora', 'bom')}
        </div>
        <section class="rel-cartao en-tempo">
          <div class="en-tempo-topo">
            <h3>Linha do tempo <small>entregas por mês, pela data prevista hoje · escolha um mês</small></h3>
          </div>
          <div class="en-meses" role="group" aria-label="Meses da agenda (setas para trocar de mês)">${linhaTempo}</div>
          <p class="en-legenda" aria-hidden="true">${legenda}</p>
        </section>
        <div class="en-colunas">
          ${cartaoLista}
          ${f ? '<div class="en-veu" data-ent-fechar aria-hidden="true"></div>' : ''}
          ${lado}
        </div>`;

      // Mês olhado à vista na linha do tempo (no celular ela rola de lado).
      const box = el.querySelector('.en-meses');
      const olhado = el.querySelector(`.en-mes[data-ent-mes="${mes}"]`);
      if (box && olhado && box.scrollWidth > box.clientWidth) box.scrollLeft = olhado.offsetLeft - box.clientWidth / 2 + olhado.offsetWidth / 2;
      if (refocar) {
        const alvo = el.querySelector(refocar);
        if (alvo) alvo.focus({ preventScroll: true });
        refocar = null;
      }
      // Vindo de uma troca de rota, a rolagem espera o app levar a tela ao topo (ver mostrar).
      if (rolarLista && rolagemAntes === null) rolarAteLista();
    }
    // Lista trocada por um número ou um mês: se o começo dela não está à vista, a tela rola até ela; e ela pisca
    // de leve, para quem já a vê perceber que mudou.
    function rolarAteLista() {
      if (rolarLista) {
        rolarLista = false;
        const c = el.querySelector('#en-lista-cartao');
        if (c) {
          // "À vista" = o topo da lista na parte de cima da área visível (40%): só o título aparecendo no pé da tela
          // não conta, porque as entregas ficariam escondidas embaixo.
          const caixa = el.getBoundingClientRect();
          const topo = Math.max(caixa.top, 0);
          const altura = Math.min(caixa.bottom, window.innerHeight) - topo;
          const r = c.getBoundingClientRect();
          const aVista = r.top >= topo && r.top <= topo + altura * 0.4;
          const calmo = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
          if (!aVista && c.scrollIntoView) c.scrollIntoView({ behavior: calmo ? 'auto' : 'smooth', block: 'start' });
          c.classList.add('en-realce');
          c.addEventListener('animationend', () => c.classList.remove('en-realce'), { once: true });
        }
      }
    }
    // Ficha da entrega: faixa da situação, avanço contra o esperado, dados, registro, alerta aberto e ações numa fileira.
    function fichaDe(f, { etiqueta, onde, nomeArea, hoje }) {
      const rg = f.registro || { remarcacoes: [], historico: [] };
      const aberta = f.situacao !== 'entregue';
      const temData = aberta && !!(f.origem.obra || f.origem.escrita);
      const precisa = FORA.includes(f.situacao);
      const origem = f.origem.obra ? 'Obra · dados da tela de obras' : f.origem.conquista ? 'Entrega registrada' : 'Serviço ou programa';
      const alerta = precisa ? alertaDe(f) : null;

      // Avanço contra o esperado: a falta (do feito ao esperado) aparece hachurada, para o atraso se ver na barra.
      const feito = Math.min(100, f.avancoPct || 0);
      const esperado = f.esperadoPct !== null ? Math.min(100, f.esperadoPct) : null;
      const falta = esperado !== null ? Math.max(0, esperado - feito) : 0;
      const avanco = f.avancoPct !== null ? `<div class="en-avanco ${f.situacao}">
          <div class="en-avanco-txt"><b>${f.avancoPct}% feito</b>${esperado !== null ? `<span>esperado hoje: ${f.esperadoPct}%${falta ? ` · <strong>${plural(falta, 'ponto', 'pontos')} abaixo</strong>` : ''}</span>` : ''}</div>
          <div class="en-prog" role="img" aria-label="${f.avancoPct}% feito${esperado !== null ? `, esperado hoje ${f.esperadoPct}%` : ''}">
            <i style="width:${feito}%"></i>${falta ? `<b class="en-prog-falta" style="left:${feito}%;width:${falta}%"></b>` : ''}${esperado !== null ? `<em style="left:clamp(2px, ${esperado}%, calc(100% - 2px))"></em>` : ''}</div>
        </div>` : '';

      const linhas = [
        [f.situacao === 'entregue' ? 'Entregue em' : 'Previsão', `${esc(GC.entregas.diaMes(f.dataAtual))} de ${f.dataAtual.slice(0, 4)}${f.remarcada ? ` <span class="en-era">(era <s>${dataBr(f.dataOriginal).slice(0, f.dataOriginal.slice(0, 4) === f.dataAtual.slice(0, 4) ? 5 : 10)}</s>)</span>` : ''}`],
        ['Pasta', esc(nomeArea(f.area))],
        ['Onde', esc(onde(f))],
        f.empresa ? ['Empresa', esc(f.empresa)] : null,
        f.meta ? ['Compromisso do plano', `${esc(f.meta.titulo)}${typeof f.meta.progressoPct === 'number' ? ` · ${f.meta.progressoPct}% · prazo ${esc(f.meta.prazo)}` : ''}`] : null,
      ].filter(Boolean);

      const reg = [];
      if (rg.confirmada) reg.push(`${ic('calendar-check')} Data confirmada${rg.confirmacao.quemNome ? ` por ${esc(rg.confirmacao.quemNome)}` : ''}`);
      if (rg.inauguracao) reg.push(`${ic('confetti')} Inauguração em ${dataBr(rg.inauguracao.dia)} às ${esc(rg.inauguracao.hora)} · ${esc(rg.inauguracao.local)}`);

      // Ações: a principal depende da situação. Inauguração só para o que está no prazo ou entregue (ou já marcada).
      const acoes = [];
      const podeRemarcar = temData && pode('remarcar', f);
      const podeConfirmar = temData && !rg.confirmada && pode('confirmar', f);
      const podeInaugurar = pode('inaugurar', f) && (rg.inauguracao || !precisa);
      if (podeConfirmar) acoes.push({ id: 'confirmar', html: (c) => `<button type="button" class="btn-sec${c}" data-ent-acao="confirmar">${ic('calendar-check')} Confirmar a data</button>` });
      if (podeRemarcar) acoes.push({ id: 'remarcar', html: (c) => `<button type="button" class="btn-sec${c}" data-ent-form="remarcar" aria-expanded="${form === 'remarcar'}">${ic('calendar-repeat')} Remarcar</button>` });
      if (podeInaugurar) {
        acoes.push(rg.inauguracao ? { id: 'desmarcar', html: (c) => `<button type="button" class="btn-sec${c}" data-ent-acao="desmarcar">${ic('calendar-x')} Desmarcar inauguração</button>` }
          : { id: 'inaugurar', html: (c) => `<button type="button" class="btn-sec${c}" data-ent-form="inaugurar" aria-expanded="${form === 'inaugurar'}">${ic('confetti')} Marcar inauguração</button>` });
      }
      if (f.origem.obra) acoes.push({ id: 'mapa', html: (c) => `<button type="button" class="btn-sec${c}" data-ent-obra="${esc(f.origem.obra)}">${ic('map-pin')} Ver no mapa</button>` });
      acoes.push({ id: 'maia', html: () => `<button type="button" class="btn-sec btn-maia-tela" data-maia="${esc(`Como está a entrega "${f.titulo}"?`)}"><i class="ti ti-sparkles" aria-hidden="true"></i> Perguntar à Maia</button>` });
      const ordemPrincipal = precisa ? ['remarcar', 'confirmar', 'mapa'] : ['confirmar', 'inaugurar', 'mapa', 'remarcar'];
      const principal = ordemPrincipal.find((id) => acoes.some((a) => a.id === id));
      acoes.sort((a, b) => (b.id === principal) - (a.id === principal));
      const botoes = acoes.map((a) => a.html(a.id === principal ? ' principal' : '')).join('');

      const motivos = Object.entries(GC.MOTIVOS_REMARCAR || {}).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('');
      const formulario = form === 'remarcar' && temData ? `<form class="en-form" data-ent-enviar="remarcar">
          <label>Nova data <input type="date" name="data" min="${hoje}" required></label>
          <label>Motivo <select name="motivo" required><option value="">Escolha</option>${motivos}</select></label>
          <label class="en-form-largo">O que aconteceu (obrigatório em "Outro motivo") <input type="text" name="texto" maxlength="300"></label>
          <span class="en-form-acoes"><button type="submit" class="btn-sec principal">Remarcar</button><button type="button" class="btn-sec" data-ent-form="">Cancelar</button></span>
        </form>`
        : form === 'inaugurar' ? `<form class="en-form" data-ent-enviar="inaugurar">
          <label>Dia <input type="date" name="dia" min="${hoje}" value="${f.dataAtual >= hoje ? f.dataAtual : hoje}" required></label>
          <label>Hora <input type="time" name="hora" value="10:00" required></label>
          <label class="en-form-largo">Local <input type="text" name="local" maxlength="300" value="${esc(f.bairroId ? onde(f) : '')}" required></label>
          <span class="en-form-acoes"><button type="submit" class="btn-sec principal">Marcar</button><button type="button" class="btn-sec" data-ent-form="">Cancelar</button></span>
        </form>` : '';
      const msg = aviso ? `<p class="en-aviso ${aviso.ok ? 'ok' : 'erro'}" role="status">${esc(aviso.texto)}</p>` : '';
      const hist = rg.remarcacoes.length ? `<h4>Remarcações</h4><ul class="en-hist">${rg.remarcacoes.slice().reverse().map((ev) => `<li>${dataBr(ev.de)} → <b>${dataBr(ev.data)}</b> · ${esc((GC.MOTIVOS_REMARCAR || {})[ev.motivo] || ev.motivo)}${ev.texto ? `: ${esc(ev.texto)}` : ''}<small>${ev.quemNome ? `${esc(ev.quemNome)}, ` : ''}${new Date(ev.em).toLocaleDateString('pt-BR')}</small></li>`).join('')}</ul>` : '';
      // Cobrar e acompanhar ficam na Central: aqui só o caminho até o alerta aberto.
      const blocoAlerta = alerta ? `<p class="en-alerta">${ic('bell')} Há um alerta aberto sobre esta obra na Central.
          <button type="button" class="en-link" data-ent-alerta="${esc(alerta.id)}">Ver o alerta</button></p>` : '';

      return `<section class="rel-cartao en-ficha" tabindex="-1" aria-labelledby="en-ficha-titulo">
          <header class="en-ficha-topo ${f.situacao}">
            <div class="en-ficha-sit">${etiqueta(f)}<span>${esc(marca(f))}</span></div>
            <h3 id="en-ficha-titulo">${esc(f.titulo)}</h3>
            <small>${esc(origem)}</small>
            <button type="button" class="en-fechar" data-ent-fechar aria-label="Fechar a ficha" title="Fechar a ficha">${ic('x')}</button>
          </header>
          <p class="en-ficha-resumo">${esc(maiuscula(GC.entregas.situacaoEmPalavras(f)))}.</p>
          ${f.descricao ? `<p>${esc(f.descricao)}</p>` : ''}
          ${avanco}
          <dl>${linhas.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v}</dd>`).join('')}</dl>
          ${reg.length ? `<p class="en-reg">${reg.join('<br>')}</p>` : ''}
          ${blocoAlerta}
          <span class="en-ficha-acoes">${botoes}</span>
          ${formulario}${msg}${hist}
        </section>`;
    }

    function fecharFicha() {
      const antes = sel;
      sel = null; form = null; aviso = null;
      refocar = antes ? `.en-cartao-lista [data-ent-id="${CSS.escape(antes)}"]` : null;
      desenhar();
    }

    el.addEventListener('click', (e) => {
      const m = e.target.closest('[data-ent-mes]');
      if (m) {
        // ‹ › e "Hoje" mantêm a lista de entregues (para andar pelos anos); o resto mostra o mês.
        const nav = m.dataset.entNav;
        if (nav) return ir({ mes: m.dataset.entMes, ver: ver === 'entregues' ? ver : null }, `[data-ent-nav="${nav}"]`);
        rolarLista = true;
        return ir({ mes: m.dataset.entMes, ver: null }, m.classList.contains('en-mes') ? `.en-mes[data-ent-mes="${m.dataset.entMes}"]` : null);
      }
      if (e.target.closest('[data-ent-relatorio]')) return aoRelatorio({ pasta: filtroArea || null, bairro: filtroBairro || null });
      const v = e.target.closest('[data-ent-ver]');
      if (v) {
        const id = v.dataset.entVer;
        rolarLista = true;
        // "Este mês" volta ao mês de hoje; os outros abrem a lista deles (de novo, fecha).
        if (id === 'mes') return ir({ mes: chaveMes(GC.relogio.hoje), ver: null, sit: '' }, '.en-kpi[data-ent-ver="mes"]');
        return ir({ ver: id === ver ? null : id, sit: '' }, `.en-kpi[data-ent-ver="${id}"]`);
      }
      const s = e.target.closest('[data-ent-sit]');
      if (s) return ir({ sit: s.dataset.entSit }, `.en-sit[data-ent-sit="${s.dataset.entSit}"]`);
      if (e.target.closest('[data-ent-limpar]')) return ir({ pasta: '', bairro: '', ver: null, sit: '' }, '[data-ent-filtro="pasta"]');
      const al = e.target.closest('[data-ent-alerta]');
      if (al) return aoAbrirAlerta(al.dataset.entAlerta);
      if (e.target.closest('[data-ent-fechar]')) return fecharFicha();
      const it = e.target.closest('[data-ent-id]');
      if (it) {
        sel = it.dataset.entId; form = null; aviso = null;
        refocar = '.en-ficha';
        desenhar();
        const fi = el.querySelector('.en-ficha');
        if (fi && !celular() && fi.scrollIntoView) fi.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        return;
      }
      const o = e.target.closest('[data-ent-obra]');
      if (o) return aoVerObra(o.dataset.entObra);
      const fb = e.target.closest('[data-ent-form]');
      if (fb) {
        form = fb.dataset.entForm === form ? null : (fb.dataset.entForm || null);
        aviso = null;
        refocar = form ? '.en-form input, .en-form select' : '.en-ficha-acoes .principal, .en-ficha-acoes button';
        return desenhar();
      }
      const ac = e.target.closest('[data-ent-acao]');
      if (ac) agir(ac.dataset.entAcao, {});
    });
    // Teclado: setas trocam de mês na linha do tempo.
    el.addEventListener('keydown', (e) => {
      const m = e.target.closest('.en-mes');
      if (m && ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) {
        const botoes = [...el.querySelectorAll('.en-mes')];
        const i = botoes.indexOf(m);
        const alvo = e.key === 'Home' ? botoes[0] : e.key === 'End' ? botoes[botoes.length - 1] : botoes[i + (e.key === 'ArrowLeft' ? -1 : 1)];
        if (alvo) { e.preventDefault(); ir({ mes: alvo.dataset.entMes, ver: null }, `.en-mes[data-ent-mes="${alvo.dataset.entMes}"]`); }
      }
    });
    // Esc com a ficha aberta: fecha só a ficha (volta às datas marcadas; no celular, fecha a folha). Na captura do
    // documento, antes do Esc geral do painel (que voltaria ao mapa); só quando o foco está nesta tela (uma janela de
    // confirmação por cima fica com o Esc).
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape' || !sel || el.hidden) return;
      if (!el.contains(document.activeElement)) return;
      e.stopImmediatePropagation(); e.preventDefault();
      fecharFicha();
    }, true);
    // Resultado de uma ação: fecha o formulário e diz o que aconteceu (a lista já vem com a data nova).
    const FEITO = { confirmar: 'Data confirmada.', remarcar: 'Entrega remarcada. A nova data já vale na agenda e na tela de obras.', inaugurar: 'Inauguração marcada. Ela aparece na agenda do gabinete.', desmarcar: 'Inauguração desmarcada.' };
    function agir(acao, dados) {
      const r = aoAgir(acao, sel, dados) || { ok: false };
      aviso = r.ok ? { ok: true, texto: FEITO[acao] } : { ok: false, texto: ERROS[r.motivo] || 'Não deu certo. Confira os campos.' };
      if (r.ok) form = null;
      refocar = '.en-aviso';
      desenhar();
    }
    el.addEventListener('submit', (e) => {
      const fm = e.target.closest('[data-ent-enviar]');
      if (!fm) return;
      e.preventDefault();
      agir(fm.dataset.entEnviar, Object.fromEntries(new FormData(fm).entries()));
    });
    el.addEventListener('change', (e) => {
      // Mês e ano da linha do tempo: vão juntos para a rota (a lista de entregues continua aberta, agora no ano novo).
      const esc2 = e.target.closest('[data-ent-escolha]');
      if (esc2) {
        const mm = el.querySelector('[data-ent-escolha="mes"]').value;
        const aa = el.querySelector('[data-ent-escolha="ano"]').value;
        return ir({ mes: `${aa}-${mm}`, ver: ver === 'entregues' ? ver : null }, `[data-ent-escolha="${esc2.dataset.entEscolha}"]`);
      }
      const s = e.target.closest('[data-ent-filtro]');
      if (!s) return;
      ir({ [s.dataset.entFiltro]: s.value }, `[data-ent-filtro="${s.dataset.entFiltro}"]`);
    });

    // Lê o recorte da rota (pasta, bairro, lista e situação validados; o setor começa na própria pasta na primeira vez).
    function lerRota(r) {
      const areas = (GC.data.areas || []).map((a) => a.id);
      const bairros = new Set(GC.data.bairros.map((b) => b.id));
      const minhas = ctx.areas || null;
      filtroArea = r.pasta && areas.includes(r.pasta) ? r.pasta : '';
      if (inicial && !r.pasta && minhas && minhas.length === 1) filtroArea = minhas[0];
      inicial = false;
      filtroBairro = r.bairro && bairros.has(r.bairro) ? r.bairro : '';
      ver = lerVer(r.ver);
      sit = SITS.some(([id]) => id && id === r.sit) ? r.sit : '';
    }

    return {
      mostrar(r, c) {
        rota = r || rota; ctx = c || ctx; lerRota(rota); desenhar();
        // A troca de rota feita aqui dentro: o app leva a tela ao topo logo depois deste mostrar (no mesmo passo);
        // numa microtarefa, antes de a tela ser pintada, a posição volta e, se for o caso, a tela rola até a lista.
        if (rolagemAntes !== null) {
          const y = rolagemAntes;
          Promise.resolve().then(() => { el.scrollTop = y; rolagemAntes = null; rolarAteLista(); });
        }
      },
      atualizar(c) { ctx = c || ctx; desenhar(); },
    };
  };
})(window.GC = window.GC || {});
