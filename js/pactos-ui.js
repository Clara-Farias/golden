(function (GC) {
  // Telas de metas pactuadas, plano de ação e reunião de resultados (regras em js/pactos.js e js/reuniao.js),
  // na página da secretaria (js/tela-secretaria.js). Botões: data-pc="<ação>"; formulários: data-pc-tipo.
  const esc = (t) => GC.escaparHtml(t);
  const SITUACAO = { ok: 'Na meta', atencao: 'Atenção', critico: 'Fora da meta', sem_dado: 'Sem dado' };
  const SELO = { ok: 'ok', atencao: 'aberta', critico: 'vencida', sem_dado: 'andamento' };
  const fmt = (v, u) => (GC.formatarIndicador ? GC.formatarIndicador(v, u) : v);
  const mesBr = (m) => { const [a, mm] = String(m).split('-'); return `${mm}/${a}`; };
  const diaBr = (d) => String(d).split('-').reverse().join('/');
  const hojeMais = (dias) => { const d = new Date(GC.agora() + dias * 86400000); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const mesMais = (meses) => { const d = new Date(GC.agora()); d.setMonth(d.getMonth() + meses); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };

  GC.ERROS_PACTO = {
    valor: 'Diga o valor da meta.', prazo: 'Escolha o prazo.', motivo: 'Diga o motivo.', ja_proposto: 'Você já propôs: espere a resposta.',
    mesmo_lado: 'A proposta é sua: espere o outro lado.', sem_proposta: 'A proposta mudou. Veja de novo.', causa: 'Diga a causa.',
    acoes: 'Escreva ao menos uma ação.', texto: 'Escreva a ação.', muitas_acoes: 'O plano já tem 5 ações.', ja_feita: 'A ação já foi feita.',
    sem_mudanca: 'Nada mudou.', nao_atrasada: 'A ação não está atrasada.', ja_cobrada: 'A ação já foi cobrada: espere a resposta.', sem_cobranca: 'A cobrança mudou. Veja de novo.',
    prazo_passado: 'A nova data precisa ser hoje ou depois.', foto_grande: 'A foto ficou grande demais. Tente outra.', marcos: 'Confira os marcos: mês antes do prazo, um por mês, com valor.', ja_tem_plano: 'Já há um plano ativo.', permissao: 'Não é do seu papel.',
  };

  const rodape = (rotulo) => `<p class="cb-erro" role="alert"></p><div class="cb-form-pe"><button type="submit" class="btn-acao principal">${rotulo}</button><button type="button" class="btn-sec" data-pc-fechar>Cancelar</button></div>`;

  function formProposta(i, titulo, valorSugerido) {
    return `<form class="cb-form" data-pc-tipo="propor" data-pc-ind="${esc(i.id)}" hidden>
      <p class="cb-form-tit">${titulo}</p>
      <div class="pc-linha"><label class="cb-campo">Meta (${esc(i.unidade)})<input type="number" step="any" name="valor" value="${esc(valorSugerido)}"></label>
      <label class="cb-campo">Até<input type="month" name="prazo" value="${mesMais(3)}"></label></div>
      <label class="cb-campo">Motivo<textarea name="motivo" rows="2" maxlength="300"></textarea></label>
      <details class="pc-marcos"><summary>Escrever o caminho mês a mês (opcional)</summary>
        <p class="op-nota">Sem marcos, o caminho é uma linha reta do valor de hoje até a meta.</p>
        ${[1, 2, 3].map((n) => `<div class="pc-linha"><label class="cb-campo">Mês<input type="month" name="marcoMes${n}"></label>
          <label class="cb-campo">Valor (${esc(i.unidade)})<input type="number" step="any" name="marcoValor${n}"></label></div>`).join('')}
      </details>
      ${rodape('Enviar proposta')}</form>`;
  }

  // Quem pode responder pela ação: o secretário (valor vazio) e os diretores de unidade da pasta.
  function opcoesResponsavel(area, atual = null) {
    const lista = GC.responsaveisPlano ? GC.responsaveisPlano(area) : [];
    return lista.map((u) => {
      const v = u.nivel === 'unidade' ? u.id : '';
      return `<option value="${esc(v)}"${(atual || '') === v ? ' selected' : ''}>${esc(u.nome)}${u.unidade ? ` · ${esc(u.unidade)}` : ' · secretário(a)'}</option>`;
    }).join('');
  }
  const MAX_ACOES_FORM = 5;
  function camposAcao(area, sufixo, { texto = '', prazo, responsavel = null } = {}, rotulo = 'Ação') {
    return `<div class="pc-linha pc-linha-acao"><label class="cb-campo">${rotulo}<input type="text" name="acao${sufixo}" maxlength="160" value="${esc(texto)}"></label>
      <label class="cb-campo">Prazo<input type="date" name="prazo${sufixo}" value="${esc(prazo)}"></label>
      <label class="cb-campo">Responsável<select name="resp${sufixo}">${opcoesResponsavel(area, responsavel)}</select></label></div>`;
  }
  function formPlano(i) {
    return `<form class="cb-form" data-pc-tipo="plano" data-pc-ind="${esc(i.id)}" hidden>
      <p class="cb-form-tit">Plano de ação: ${esc(i.nome)}</p>
      <label class="cb-campo">Por que saiu da meta<textarea name="causa" rows="2" maxlength="300"></textarea></label>
      ${Array.from({ length: MAX_ACOES_FORM }, (_, k) => camposAcao(i.area, k + 1, { prazo: hojeMais(7 * (k + 1)) }, `Ação ${k + 1}${k ? ' (opcional)' : ''}`)).join('')}
      ${rodape('Registrar plano')}</form>`;
  }

  // Uma ação do plano: responsável, prazo, evidência, cobrança do prefeito e os botões de quem pode.
  // Cada ação é uma caixa (data-pc-caixa) com os próprios formulários.
  const dataBr = (t) => new Date(t).toLocaleDateString('pt-BR');
  function acaoHtml(i, plano, a, perfil) {
    const id = esc(i.id);
    const hoje = hojeMais(0);
    const atrasada = !a.feita && a.prazo < hoje;
    const cobr = (a.cobrancas || []).find((c) => !c.resposta) || null;
    const resposta = [...(a.cobrancas || [])].reverse().find((c) => c.resposta && c.resposta.tipo === 'nova_data');
    const pode = (x) => GC.podeNaAcaoPlano && GC.podeNaAcaoPlano(x, a, i.area, perfil);
    const marca = `data-pc-ind="${id}" data-pc-acao="${a.id}"`;
    const botoes = [];
    if (!a.feita && pode('marcar')) botoes.push('<button type="button" class="btn-sec" data-pc-form="feita">Feita</button>');
    if (cobr && pode('responder')) botoes.push('<button type="button" class="btn-sec" data-pc-form="responder_acao">Dar nova data</button>');
    if (!a.feita && pode('editar')) botoes.push('<button type="button" class="btn-sec" data-pc-form="editar_acao">Editar</button>');
    if (atrasada && !cobr && pode('cobrar')) botoes.push(`<button type="button" class="btn-acao principal" data-pc="cobrar_acao" ${marca}>Cobrar</button>`);
    if (a.feita && pode('marcar')) botoes.push(`<button type="button" class="btn-sec" data-pc="desfazer" ${marca}>Desfazer</button>`);
    const ev = a.evidencia;
    return `<li class="pc-acao${a.feita ? ' feita' : atrasada ? ' atrasada' : ''}" data-pc-caixa="${id}-a${a.id}">
      <div class="pc-acao-topo"><span class="pc-acao-txt">${esc(a.texto)}</span>
        <small>${a.feita ? 'feita' : `até ${diaBr(a.prazo)}${atrasada ? ' · atrasada' : ''}`}</small></div>
      <p class="pc-acao-info">${esc(GC.nomeResponsavelPlano ? GC.nomeResponsavelPlano(a, i.area) : '')}${a.feita && a.feitaEm ? ` · feita${a.feitaPor ? ` por ${esc(a.feitaPor)}` : ''} em ${dataBr(a.feitaEm)}` : ''}</p>
      ${ev && (ev.texto || ev.foto) ? `<div class="pc-acao-ev">${ev.texto ? `<p>${esc(ev.texto)}</p>` : ''}${ev.foto ? `<img class="cb-foto" src="${esc(ev.foto)}" alt="Foto enviada como evidência da ação">` : ''}</div>` : ''}
      ${cobr ? `<p class="pc-acao-cobr">📣 Cobrada${cobr.quem ? ` por ${esc(cobr.quem)}` : ' pelo prefeito'} em ${dataBr(cobr.em)} · espera nova data ou a ação feita</p>` : ''}
      ${!cobr && resposta ? `<p class="pc-acao-resp">Nova data depois da cobrança: ${diaBr(resposta.resposta.prazo)} · “${esc(resposta.resposta.texto)}”</p>` : ''}
      ${botoes.length ? `<div class="cb-botoes">${botoes.join('')}</div>` : ''}
      ${!a.feita && pode('marcar') ? `<form class="cb-form" data-pc-tipo="feita" ${marca} hidden>
        <p class="cb-form-tit">O que foi feito (opcional)</p>
        <textarea name="texto" rows="2" maxlength="400" aria-label="O que foi feito"></textarea>
        <label class="cb-campo">Foto (opcional)<input type="file" name="foto" accept="image/*"></label>
        ${rodape('Marcar feita')}</form>` : ''}
      ${cobr && pode('responder') ? `<form class="cb-form" data-pc-tipo="responder_acao" ${marca} hidden>
        <p class="cb-form-tit">Nova data para a ação</p>
        <label class="cb-campo">Nova data<input type="date" name="prazo" min="${hoje}" value="${hojeMais(7)}"></label>
        <label class="cb-campo">Por que atrasou<textarea name="texto" rows="2" maxlength="300"></textarea></label>
        ${rodape('Enviar resposta')}</form>` : ''}
      ${!a.feita && pode('editar') ? `<form class="cb-form" data-pc-tipo="editar_acao" ${marca} hidden>
        <p class="cb-form-tit">Mudar a ação</p>
        ${camposAcao(i.area, '', a)}
        ${rodape('Salvar')}</form>` : ''}
    </li>`;
  }
  // Efeito do plano: o valor do indicador quando o plano foi criado × agora.
  function efeitoHtml(i, plano) {
    const e = GC.efeitoPlano ? GC.efeitoPlano(plano, i) : null;
    if (!e) return '';
    const txt = e.melhorou === null ? 'sem mudança' : e.melhorou ? 'melhorou' : 'piorou';
    return `<p class="pc-efeito r-${e.melhorou === null ? 'igual' : e.melhorou ? 'melhorou' : 'piorou'}">Desde o plano (${dataBr(plano.em)}): ${esc(fmt(e.inicial, i.unidade))} → ${esc(fmt(e.atual, i.unidade))} · <b>${txt}</b></p>`;
  }
  function planoHtml(i, plano, perfil) {
    const id = esc(i.id);
    const podeEditar = GC.podeNaAcaoPlano && GC.podeNaAcaoPlano('editar', null, i.area, perfil);
    const feitas = plano.acoes.filter((a) => a.feita).length;
    const cabe = plano.acoes.length < MAX_ACOES_FORM;
    return `<div class="pc-plano" data-pc-caixa="${id}-plano"><p><b>Plano de ação</b> · ${esc(plano.causa)} <small>${feitas} de ${plano.acoes.length} feitas</small></p>
      ${efeitoHtml(i, plano)}
      <ul>${plano.acoes.map((a) => acaoHtml(i, plano, a, perfil)).join('')}</ul>
      ${podeEditar ? `<div class="cb-botoes">${cabe ? '<button type="button" class="btn-sec" data-pc-form="nova_acao">Acrescentar ação</button>' : ''}<button type="button" class="btn-sec" data-pc="encerrar" data-pc-ind="${id}">Encerrar plano</button></div>
        ${cabe ? `<form class="cb-form" data-pc-tipo="nova_acao" data-pc-ind="${id}" hidden><p class="cb-form-tit">Nova ação</p>${camposAcao(i.area, '', { prazo: hojeMais(7) })}${rodape('Acrescentar')}</form>` : ''}` : ''}
    </div>`;
  }

  // Ciclo da meta pactuada: de onde partiu, o marco deste mês e o ritmo; vencida, a apuração.
  const RITMO = { no_ritmo: 'no ritmo', atrasado: 'atrasado' };
  function cicloHtml(i, p) {
    const m = i.metaInfo;
    if (!i.metaPactuada || !m) return '';
    if (m.apurada) {
      const c = m.apurada;
      return `<p class="pc-ciclo r-${c.resultado}">Prazo venceu: apurado ${esc(fmt(c.valor, i.unidade))}${c.fonte === 'agora' ? ` em ${new Date(c.em).toLocaleDateString('pt-BR')}` : ` em ${mesBr(c.prazo)}`}, meta ${esc(fmt(c.meta, i.unidade))} · <b>${c.resultado === 'cumprida' ? 'cumprida' : 'não cumprida'}</b>. A meta continua valendo até o próximo pacto.</p>`;
    }
    if (i.pactoVencido) return '<p class="pc-ciclo">Prazo venceu: a apuração sai em instantes.</p>';
    const partes = [];
    if (typeof m.linhaBase === 'number') partes.push(`partiu de ${esc(fmt(m.linhaBase, i.unidade))} em ${mesBr(GC.mesDe(m.pactuadaEm))}`);
    if (typeof i.marcoAtual === 'number') partes.push(`marco deste mês: ${esc(fmt(i.marcoAtual, i.unidade))}`);
    if (i.ritmo) partes.push(`<b>${RITMO[i.ritmo]}</b>`);
    return partes.length ? `<p class="pc-ciclo${i.ritmo ? ` r-${i.ritmo}` : ''}">${partes.join(' · ')}</p>` : '';
  }
  // Ciclos fechados do indicador (o atual apurado já aparece acima).
  function ciclosAnteriores(i, p) {
    const lista = ((p && p.ciclos) || []).filter((c) => !(i.metaInfo && i.metaInfo.apurada && c.em === i.metaInfo.apurada.em && c.resultado !== 'substituida'));
    if (!lista.length) return '';
    const TXT = { cumprida: 'cumprida', nao_cumprida: 'não cumprida', substituida: 'trocada antes do prazo' };
    return `<details class="pc-ciclos"><summary>Ciclos anteriores (${lista.length})</summary><ul>${lista.slice().reverse().map((c) => `
      <li class="r-${c.resultado}">Meta ${esc(fmt(c.meta, i.unidade))} até ${mesBr(c.prazo)}${typeof c.valor === 'number' ? ` · apurado ${esc(fmt(c.valor, i.unidade))}` : ''} · <b>${TXT[c.resultado]}</b></li>`).join('')}</ul></details>`;
  }

  GC.htmlCicloMeta = cicloHtml; // também na ficha do indicador (js/tela-indicadores.js)
  GC.htmlCiclosAnteriores = ciclosAnteriores;

  // Um indicador: situação, meta (pactuada ou do plano), a negociação e o plano de ação.
  function cartao(i, perfil) {
    const pc = GC.pactos;
    const p = pc.pacto(i.id);
    const lado = GC.ladoPacto(perfil);
    const podePropor = GC.podePactuar('propor', i.area, perfil);
    const id = esc(i.id);
    const botoes = [];
    let negociacao = '';
    if (p && p.proposta) {
      const minha = p.proposta.lado === lado;
      negociacao = `<p class="pc-proposta"><b>${p.proposta.lado === 'prefeito' ? 'O prefeito propõe' : 'A secretaria propõe'}</b> ${esc(fmt(p.proposta.valor, i.unidade))} até ${mesBr(p.proposta.prazo)} · “${esc(p.proposta.motivo)}”${minha ? ' <small>(aguardando o outro lado)</small>' : ''}</p>`;
      if (!minha && GC.podePactuar('aceitar', i.area, perfil)) {
        botoes.push(`<button type="button" class="btn-acao principal" data-pc="aceitar" data-pc-ind="${id}">Aceitar a meta</button>`);
        botoes.push(`<button type="button" class="btn-sec" data-pc-form="propor" data-pc-ind="${id}">Contrapropor</button>`);
      }
    } else if (podePropor) {
      const rotulo = i.pactoVencido ? 'Propor o próximo ciclo' : p && p.vigente ? 'Rever a meta' : 'Propor meta';
      botoes.push(`<button type="button" class="${i.pactoVencido ? 'btn-acao principal' : 'btn-sec'}" data-pc-form="propor" data-pc-ind="${id}">${rotulo}</button>`);
    }
    const plano = pc.planoAtivo(i.id);
    const fora = i.situacao === 'critico' || i.situacao === 'atencao';
    const podePlano = GC.podePactuar('plano', i.area, perfil);
    let blocoPlano = '';
    if (plano) {
      blocoPlano = planoHtml(i, plano, perfil);
    } else if (fora && i.ritmo === 'no_ritmo') {
      // Fora da meta final, mas seguindo o caminho combinado no pacto: o plano fica opcional.
      blocoPlano = '<p class="pc-ciclo">Ainda fora da meta, mas no ritmo do caminho combinado.</p>';
      if (podePlano) botoes.push(`<button type="button" class="btn-sec" data-pc-form="plano" data-pc-ind="${id}">Registrar plano de ação</button>`);
    } else if (fora) {
      blocoPlano = `<p class="pc-sem-plano">Fora da meta e sem plano de ação.</p>`;
      if (podePlano) botoes.push(`<button type="button" class="btn-acao principal" data-pc-form="plano" data-pc-ind="${id}">Registrar plano de ação</button>`);
    }
    return `<article class="pc-ind" data-pc-caixa="${id}">
      <div class="cb-item-topo"><h4>${esc(i.nome)}</h4><span class="cb-selo ${SELO[i.situacao]}">${SITUACAO[i.situacao]}</span></div>
      <p class="pc-numeros"><b>${esc(fmt(i.valorAtual, i.unidade))}</b> · meta ${esc(fmt(i.metaAtual, i.unidade))}
        ${i.metaPactuada ? `<span class="pc-tag${i.pactoVencido ? ' vencida' : ''}">${i.pactoVencido ? 'prazo vencido' : 'pactuada'} · ${mesBr(i.prazoPactuado)}</span>` : '<span class="pc-tag neutra">meta de referência</span>'}</p>
      ${cicloHtml(i, p)}${negociacao}${blocoPlano}${ciclosAnteriores(i, p)}
      ${botoes.length ? `<div class="cb-botoes">${botoes.join('')}</div>` : ''}
      ${podePropor ? formProposta(i, p && p.proposta ? 'Contraproposta' : 'Propor meta', p && p.proposta ? p.proposta.valor : i.metaAtual) : ''}
      ${podePlano && !plano ? formPlano(i) : ''}
    </article>`;
  }

  // Seção "Metas dos indicadores": um cartão por indicador da secretaria, fora da meta primeiro.
  GC.htmlMetasPasta = function (indicadores, perfil = GC.perfil) {
    if (!GC.pactos || !indicadores.length) return '';
    const ordem = { critico: 0, atencao: 1, ok: 2, sem_dado: 3 };
    const lista = indicadores.slice().sort((a, b) => ordem[a.situacao] - ordem[b.situacao]);
    const pactuadas = lista.filter((i) => i.metaPactuada).length;
    return `<p class="op-frase">${pactuadas} de ${lista.length} metas pactuadas · ${lista.filter((i) => i.situacao === 'critico' || i.situacao === 'atencao').length} fora da meta</p>
      <div class="pc-lista">${lista.map((i) => cartao(i, perfil)).join('')}</div>`;
  };

  // Seção "Reunião de resultados": a pauta montada e as notas da pasta.
  GC.htmlReuniao = function (pauta, perfil = GC.perfil) {
    if (!pauta) return '';
    const podeNota = GC.podePactuar('nota', pauta.area, perfil);
    const nota = pauta.nota;
    const TOM = { sem_plano: 'vencida', plano_atrasado: 'vencida', com_plano: 'aberta', meta_negociacao: 'espera', meta_nao_cumprida: 'vencida', meta_cumprida: 'ok', no_ritmo: 'aberta' };
    return `<p class="op-frase">Pauta dos últimos ${pauta.dias} dias, montada com os dados de agora.</p>
      ${pauta.itens.length ? `<ol class="pc-pauta">${pauta.itens.map((it) => `<li class="t-${TOM[it.tipo] || 'neutro'}">${esc(it.texto)}</li>`).join('')}</ol>` : GC.htmlCalmo ? GC.htmlCalmo('Nada fora do normal para levar à reunião.') : '<p>Nada fora do normal.</p>'}
      <div class="pc-nota" data-pc-caixa="nota-${esc(pauta.area)}">
        <h4>O que a pasta vai levar</h4>
        ${podeNota ? `<form class="pc-form-nota" data-pc-tipo="nota" data-pc-area="${esc(pauta.area)}">
          <textarea name="texto" rows="3" maxlength="1200" placeholder="Pedidos, entregas e o que precisa da decisão do prefeito">${esc(nota ? nota.texto : '')}</textarea>
          <p class="cb-erro" role="alert"></p><div class="cb-form-pe"><button type="submit" class="btn-sec">Salvar notas</button>${nota ? `<small>salvo por ${esc(nota.quem || '')}</small>` : ''}</div></form>`
    : `<p>${nota && nota.texto ? esc(nota.texto) : '<span class="op-nota">A pasta ainda não escreveu as notas.</span>'}</p>`}
      </div>`;
  };

  // acoes: { executar(acao, dados) → { ok, motivo }, aoConcluir?() }
  GC.ligarPactos = function (raiz, acoes) {
    if (!raiz || raiz.dataset.pcLigado) return;
    raiz.dataset.pcLigado = '1';
    raiz.addEventListener('click', (e) => {
      const alvo = e.target.closest('[data-pc], [data-pc-form], [data-pc-fechar]');
      if (!alvo || !raiz.contains(alvo)) return;
      if (alvo.matches('[data-pc-form]')) {
        const dono = alvo.closest('[data-pc-caixa]');
        dono.querySelectorAll(':scope > .cb-form').forEach((f) => { f.hidden = f.dataset.pcTipo !== alvo.dataset.pcForm || !f.hidden; });
        return;
      }
      if (alvo.matches('[data-pc-fechar]')) { alvo.closest('.cb-form').hidden = true; return; }
      const acao = alvo.dataset.pc;
      if (acao === 'acao') { acoes.executar('acao', { indId: alvo.dataset.pcInd, acaoId: alvo.dataset.pcAcao, feita: alvo.checked }); return; }
      const r = acoes.executar(acao, { indId: alvo.dataset.pcInd, acaoId: alvo.dataset.pcAcao }) || { ok: true };
      if (r.ok === false && r.motivo) window.alert(GC.ERROS_PACTO[r.motivo] || 'Não deu certo. Tente de novo.');
      else if (acoes.aoConcluir && alvo.dataset.pcAcao) acoes.aoConcluir();
    });
    raiz.addEventListener('submit', async (e) => {
      const form = e.target.closest('[data-pc-tipo]');
      if (!form) return;
      e.preventDefault();
      const f = new FormData(form);
      const tipo = form.dataset.pcTipo;
      const daAcao = { indId: form.dataset.pcInd, acaoId: form.dataset.pcAcao };
      const arquivo = form.querySelector('input[type=file]');
      const foto = arquivo && arquivo.files && arquivo.files[0] && GC.reduzirFoto ? await GC.reduzirFoto(arquivo.files[0]) : null;
      let dados;
      if (tipo === 'propor') {
        dados = { indId: form.dataset.pcInd, valor: f.get('valor'), prazo: f.get('prazo'), motivo: f.get('motivo'),
          marcos: [1, 2, 3].map((n) => ({ mes: f.get(`marcoMes${n}`), valor: f.get(`marcoValor${n}`) })) };
      }
      else if (tipo === 'plano') {
        dados = { indId: form.dataset.pcInd, causa: f.get('causa'),
          acoes: Array.from({ length: MAX_ACOES_FORM }, (_, k) => ({ texto: f.get(`acao${k + 1}`), prazo: f.get(`prazo${k + 1}`), responsavel: f.get(`resp${k + 1}`) || null })) };
      }
      else if (tipo === 'feita') dados = Object.assign(daAcao, { texto: f.get('texto'), foto });
      else if (tipo === 'responder_acao') dados = Object.assign(daAcao, { tipo: 'nova_data', prazo: f.get('prazo'), texto: f.get('texto') });
      else if (tipo === 'editar_acao' || tipo === 'nova_acao') dados = Object.assign(daAcao, { texto: f.get('acao'), prazo: f.get('prazo'), responsavel: f.get('resp') || null });
      else dados = { area: form.dataset.pcArea, texto: f.get('texto') };
      const r = acoes.executar(tipo, dados) || { ok: false };
      const erro = form.querySelector('.cb-erro');
      if (!r.ok) { if (erro) erro.textContent = GC.ERROS_PACTO[r.motivo] || 'Não deu certo. Tente de novo.'; return; }
      if (erro) erro.textContent = '';
      if (form.classList.contains('cb-form')) form.hidden = true;
      if (acoes.aoConcluir) acoes.aoConcluir(); // a tela esperava o formulário fechar para redesenhar
    });
  };
})(window.GC = window.GC || {});
