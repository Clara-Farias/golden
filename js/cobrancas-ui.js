(function (GC) {
  // Telas da cobrança (dados e regras em js/cobrancas.js): o item da aba "📣 Cobranças" da gaveta Alertas
  // e o bloco "Cobrança" no detalhe da ocorrência, com o formulário de resposta do secretário e as
  // decisões do prefeito. Os botões levam data-cb="<ação>" e data-cb-id; quem executa é o app (ligarCobranca).
  const esc = (t) => GC.escaparHtml(t);
  const MIN = 60000;
  const area = (id) => GC.data.areas.find((a) => a.id === id);
  const bairro = (id) => GC.data.bairros.find((b) => b.id === id) || { nome: id };
  const tempo = (ms) => GC.tempoTexto(Math.max(1, Math.round(ms / MIN)));
  const ha = (t) => { const min = Math.round((GC.agora() - t) / MIN); return min < 1 ? 'agora' : `há ${GC.tempoTexto(min)}`; };
  const hora = (t) => { const d = new Date(t); return `${String(d.getHours()).padStart(2, '0')}h${String(d.getMinutes()).padStart(2, '0')}`; };

  // Por que a resposta não foi aceita (motivos de js/cobrancas.js).
  GC.ERROS_COBRANCA = {
    confirmar: 'Confirme na janela que abriu.', // ação crítica (js/app/desfazer.js): o formulário espera a janela
    minutos: 'Diga em quantos minutos a equipe chega.',
    motivo: 'Escolha o motivo.',
    area: 'Diga de qual secretaria depende.',
    texto: 'Escreva o que aconteceu.',
    pedido: 'Escolha o que falta.',
    horas: 'Escolha de quanto tempo precisa.',
    foto_grande: 'A foto ficou grande demais. Tente outra.',
    estado: 'Esta cobrança já mudou. Veja o histórico.',
    nao_vencida: 'A cobrança ainda está no prazo.',
    nao_encontrada: 'Cobrança não encontrada.',
  };

  // Selo de estado, com a cor do que pede (vencida e esperando decisão em destaque).
  function selo(c) {
    const cb = GC.cobrancas;
    if (c.estado === 'encerrada') return '<span class="cb-selo ok">Resolvida</span>';
    if (cb.vencida(c)) return '<span class="cb-selo vencida">Venceu</span>';
    if (c.estado === 'novo_prazo') return '<span class="cb-selo espera">Novo prazo pedido</span>';
    if (cb.recursoPendente(c)) return '<span class="cb-selo espera">Pediu recurso</span>';
    if (c.estado === 'aberta') return '<span class="cb-selo aberta">Sem resposta</span>';
    return '<span class="cb-selo andamento">Respondida</span>';
  }

  // Uma linha do histórico. Com quando (a tela Histórico de cobranças), a hora do passo e o intervalo desde o anterior
  // no lugar do "há N", e a 1ª resposta da secretaria (a que conta para o prazo) marcada.
  function passo(r, quando = null) {
    const quem = esc(r.quem || '');
    const extra = r.texto ? ` · “${esc(r.texto)}”` : '';
    const sim = r.simulada ? ' <small class="cb-sim">simulada</small>' : '';
    let o;
    if (r.tipo === 'previsao') o = `⏱ <b>Previsão:</b> equipe chega em ${GC.tempoTexto(r.minutos)}${extra}`;
    else if (r.tipo === 'justificativa') o = `<b>Justificativa:</b> ${esc(GC.MOTIVOS_JUSTIFICATIVA[r.motivo])}${r.area && area(r.area) ? ` (${esc(area(r.area).secretaria.nome)})` : ''}${extra}`;
    else if (r.tipo === 'recurso') o = `<b>Pedido de recurso:</b> ${esc(GC.PEDIDOS_RECURSO[r.pedido])}${extra}`;
    else if (r.tipo === 'novo_prazo') o = `<b>Pediu mais ${r.horas} h</b>${extra}`;
    else if (r.tipo === 'decisao') o = r.aprovado ? `<b>Novo prazo aprovado</b> (${r.horas} h)${extra}` : `<b>Novo prazo recusado</b>${extra}`;
    else if (r.tipo === 'recobranca') o = '📣 <b>Cobrou de novo</b>';
    else if (r.tipo === 'ciente') o = '<b>Ciente do pedido de recurso</b>';
    else if (r.tipo === 'decisao_recurso') o = r.aprovado ? `<b>Recurso aprovado</b>${r.pedido ? ` (${esc(GC.PEDIDOS_RECURSO[r.pedido] || '')})` : ''}${extra}` : `<b>Recurso negado</b>${extra}`;
    else if (r.tipo === 'evidencia') o = r.semEvidencia ? (r.texto ? `<b>Encerrada:</b> ${esc(r.texto)}` : '✅ <b>Resolvida</b> sem evidência registrada') : `✅ <b>Resolvida:</b> ${esc(r.texto)}${r.foto ? `<img class="cb-foto" src="${esc(r.foto)}" alt="Foto enviada como evidência">` : ''}`;
    else o = esc(r.tipo);
    const primeira = !!quando && quando.primeira === r;
    return `<li${primeira ? ' class="cb-primeira"' : ''}><span>${quando ? quando(r) : ha(r.em)}${quem ? ` · ${quem}` : ''}${primeira ? ' <em class="cb-tag-primeira">1ª resposta</em>' : ''}</span><p>${o}${sim}</p></li>`;
  }

  // Hora de cada passo ("16:42", com a data quando cai noutro dia que a cobrança) e o intervalo desde o anterior ("+35 min").
  function relogioDoHistorico(c) {
    const dia = (t) => new Date(t).toDateString();
    const hm = (t) => new Date(t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const dm = (t) => new Date(t).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    const marca = (t) => `<time datetime="${new Date(t).toISOString()}">${dia(t) !== dia(c.em) ? `${dm(t)} ` : ''}${hm(t)}</time>`;
    let anterior = c.em;
    const quando = (r) => {
      const passou = Math.round((r.em - anterior) / MIN);
      anterior = r.em;
      return `${marca(r.em)}${passou >= 1 ? ` <b class="cb-intervalo">+${GC.tempoTexto(passou)}</b>` : ''}`;
    };
    quando.primeira = GC.primeiraRespostaCobranca ? GC.primeiraRespostaCobranca(c) : null;
    quando.inicio = () => marca(c.em);
    return quando;
  }

  // Selo e histórico também usados pela tela Histórico de cobranças (js/tela-cobrancas.js).
  // opcoes.horas: hora e intervalo de cada passo (a tela de histórico); sem ela, "há N" (o detalhe da ocorrência).
  GC.seloCobranca = (c) => selo(c);
  GC.htmlHistoricoCobranca = (c, opcoes = {}) => {
    const quando = opcoes.horas ? relogioDoHistorico(c) : null;
    return `<ul class="cb-historico${quando ? ' cb-com-horas' : ''}">
      <li><span>${quando ? quando.inicio() : ha(c.em)} · ${esc(c.de && c.de.quem ? c.de.quem : 'Prefeito(a)')}</span><p>📣 <b>Cobrou a ${esc(area(c.area).secretaria.nome)}</b></p></li>
      ${c.respostas.map((r) => passo(r, quando)).join('')}</ul>`;
  };

  // Botões do prefeito conforme o estado.
  function botoesPrefeito(c) {
    const cb = GC.cobrancas;
    const pode = (a) => GC.podeNaCobranca(a, c);
    const id = esc(c.id);
    const b = [];
    if (c.estado === 'novo_prazo' && pode('decidir')) {
      b.push(`<button type="button" class="btn-acao principal" data-cb="aprovar" data-cb-id="${id}">Aprovar mais ${c.novoPrazoPedido.horas} h</button>`);
      b.push(`<button type="button" class="btn-sec" data-cb-form="recusar" data-cb-id="${id}">Recusar</button>`);
    }
    if (cb.recursoPendente(c) && pode('decidir_recurso')) {
      b.push(`<button type="button" class="btn-acao principal" data-cb="aprovar_recurso" data-cb-id="${id}">Aprovar recurso</button>`);
      b.push(`<button type="button" class="btn-sec" data-cb-form="negar_recurso" data-cb-id="${id}">Negar</button>`);
    }
    if (cb.vencida(c) && pode('recobrar')) b.push(`<button type="button" class="btn-acao principal" data-cb="recobrar" data-cb-id="${id}">📣 Cobrar de novo</button>`);
    return b.join('');
  }

  // Botões do secretário: cada um abre o formulário certo dentro do bloco.
  function botoesSecretario(c) {
    if (c.estado === 'encerrada' || c.estado === 'novo_prazo') return '';
    const id = esc(c.id);
    const pode = (a) => GC.podeNaCobranca(a, c);
    const b = [];
    if (pode('responder')) {
      b.push(`<button type="button" class="btn-acao principal" data-cb-form="previsao" data-cb-id="${id}">⏱ Previsão</button>`);
      b.push(`<button type="button" class="btn-sec" data-cb-form="justificativa" data-cb-id="${id}">Justificar</button>`);
      b.push(`<button type="button" class="btn-sec" data-cb-form="recurso" data-cb-id="${id}">Pedir recurso</button>`);
    }
    if (pode('pedir_prazo')) b.push(`<button type="button" class="btn-sec" data-cb-form="novo_prazo" data-cb-id="${id}">Pedir novo prazo</button>`);
    if (pode('encerrar')) b.push(`<button type="button" class="btn-sec cb-resolver" data-cb-form="evidencia" data-cb-id="${id}">✅ Resolver com evidência</button>`);
    return b.join('');
  }

  const atalhos = (nome, valores, sufixo) => `<div class="cb-atalhos">${valores.map((v) => `<label><input type="radio" name="${nome}" value="${v}"><span>${v} ${sufixo}</span></label>`).join('')}</div>`;
  const opcoes = (obj) => Object.entries(obj).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('');

  // Formulários (escondidos até o botão abrir um).
  function formularios(c) {
    const id = esc(c.id);
    const areas = GC.data.areas.filter((a) => a.id !== c.area).map((a) => `<option value="${a.id}">${esc(a.secretaria.nome)}</option>`).join('');
    const rodape = (rotulo) => `<p class="cb-erro" role="alert"></p><div class="cb-form-pe"><button type="submit" class="btn-acao principal">${rotulo}</button><button type="button" class="btn-sec" data-cb-fechar>Cancelar</button></div>`;
    return `
      <form class="cb-form" data-cb-tipo="previsao" data-cb-id="${id}" hidden>
        <p class="cb-form-tit">Quando a equipe chega?</p>
        ${atalhos('minutos', [30, 60, 120], 'min')}
        <label class="cb-campo">Outro tempo (minutos)<input type="number" name="outros" min="1" max="2880" inputmode="numeric"></label>
        <label class="cb-campo">Observação (opcional)<input type="text" name="texto" maxlength="200"></label>
        ${rodape('Enviar previsão')}
      </form>
      <form class="cb-form" data-cb-tipo="justificativa" data-cb-id="${id}" hidden>
        <p class="cb-form-tit">Por que ainda não deu?</p>
        <label class="cb-campo">Motivo<select name="motivo"><option value="">Escolha</option>${opcoes(GC.MOTIVOS_JUSTIFICATIVA)}</select></label>
        <label class="cb-campo cb-so-outra" hidden>Depende de qual secretaria?<select name="area"><option value="">Escolha</option>${areas}</select></label>
        <label class="cb-campo">Explique (opcional, obrigatório em “Outro motivo”)<textarea name="texto" rows="2" maxlength="300"></textarea></label>
        ${rodape('Enviar justificativa')}
      </form>
      <form class="cb-form" data-cb-tipo="recurso" data-cb-id="${id}" hidden>
        <p class="cb-form-tit">O que falta para resolver?</p>
        <label class="cb-campo">Recurso<select name="pedido"><option value="">Escolha</option>${opcoes(GC.PEDIDOS_RECURSO)}</select></label>
        <label class="cb-campo">O que e quanto<textarea name="texto" rows="2" maxlength="300" placeholder="Ex.: um caminhão basculante por 4 h"></textarea></label>
        ${rodape('Pedir recurso')}
      </form>
      <form class="cb-form" data-cb-tipo="novo_prazo" data-cb-id="${id}" hidden>
        <p class="cb-form-tit">De quanto tempo a mais precisa?</p>
        ${atalhos('horas', [4, 12, 24, 48], 'h')}
        <label class="cb-campo">Motivo<textarea name="texto" rows="2" maxlength="300"></textarea></label>
        ${rodape('Pedir ao prefeito')}
      </form>
      <form class="cb-form" data-cb-tipo="evidencia" data-cb-id="${id}" hidden>
        <p class="cb-form-tit">O que foi feito?</p>
        <label class="cb-campo">Descrição<textarea name="texto" rows="3" maxlength="400"></textarea></label>
        <label class="cb-campo">Foto (opcional)<input type="file" name="foto" accept="image/*"></label>
        ${rodape('Marcar como resolvida')}
      </form>
      <form class="cb-form" data-cb-tipo="negar_recurso" data-cb-id="${id}" hidden>
        <p class="cb-form-tit">Negar o pedido de recurso</p>
        <label class="cb-campo">Motivo (opcional)<input type="text" name="texto" maxlength="200" placeholder="Ex.: use o caminhão da Obras, que está livre"></label>
        ${rodape('Negar')}
      </form>
      <form class="cb-form" data-cb-tipo="recusar" data-cb-id="${id}" hidden>
        <p class="cb-form-tit">Recusar o novo prazo</p>
        <label class="cb-campo">Motivo (opcional)<input type="text" name="texto" maxlength="200" placeholder="Ex.: precisa ser resolvido hoje"></label>
        ${rodape('Recusar')}
      </form>`;
  }

  // Bloco "Cobrança" no detalhe da ocorrência.
  GC.htmlBlocoCobranca = function (c, perfil = GC.perfil) {
    if (!c) return '';
    const setor = !!perfil && GC.visaoDe(perfil) === 'pasta';
    const de = c.de && c.de.quem ? esc(c.de.quem) : 'O prefeito';
    const prazo = c.estado === 'aberta' && !GC.cobrancas.vencida(c)
      ? `<p class="cb-prazo">${setor ? 'Responda' : 'Resposta'} até <b>${hora(c.prazoRespostaEm)}</b> (faltam ${tempo(c.prazoRespostaEm - GC.agora())}).</p>` : '';
    const botoes = setor ? botoesSecretario(c) : botoesPrefeito(c);
    return `
      <section class="cb-bloco" data-cb-bloco="${esc(c.id)}">
        <div class="cb-bloco-cab"><h3>📣 Cobrança${c.vezes > 1 ? ` · ${c.vezes}×` : ''}</h3>${selo(c)}</div>
        <p class="cb-resumo">${esc(GC.resumoCobranca(c))}</p>
        ${prazo}
        <ul class="cb-historico">
          <li><span>${ha(c.em)} · ${de}</span><p>📣 <b>Cobrou a ${esc(area(c.area).secretaria.nome)}</b></p></li>
          ${c.respostas.map((r) => passo(r)).join('')}
        </ul>
        ${botoes ? `<div class="cb-botoes">${botoes}</div>` : ''}
        ${botoes ? formularios(c) : ''}
      </section>`;
  };

  // Item da aba "📣 Cobranças" (gaveta Alertas).
  function item(c, perfil) {
    const a = area(c.area);
    const r = c.retrato;
    const setor = !!perfil && GC.visaoDe(perfil) === 'pasta';
    const ultima = [...c.respostas].reverse().find((x) => x.tipo !== 'ciente');
    const linha = c.estado === 'novo_prazo' && c.novoPrazoPedido
      ? `Pediu mais ${c.novoPrazoPedido.horas} h: “${esc(c.novoPrazoPedido.motivo)}”`
      : ultima && ultima.tipo === 'recurso' ? `Pedido de recurso: ${esc(GC.PEDIDOS_RECURSO[ultima.pedido])} · “${esc(ultima.texto)}”`
        : esc(GC.resumoCobranca(c));
    // A resposta sai da própria lista: a ocorrência pode ainda não existir no mapa desta aba
    // (cada aba simula a cidade dela), e a cobrança traz o retrato do que importa.
    const acoes = setor ? botoesSecretario(c) : botoesPrefeito(c);
    return `
      <article class="cb-item${GC.cobrancas.vencida(c) ? ' vencida' : ''} ${esc(r.severidade)}" data-cb-abrir="${esc(c.ocorrenciaId)}" data-abre-gaveta tabindex="0">
        <div class="cb-item-topo"><h3>${esc(r.titulo)}</h3>${selo(c)}</div>
        <div class="cb-item-meta">${esc(bairro(r.bairroId).nome)}${setor ? '' : ` · ${a.secretaria.emoji} ${esc(a.secretaria.nome)}`} · cobrada ${ha(c.em)}${c.vezes > 1 ? ` · ${c.vezes}×` : ''}</div>
        <p class="cb-item-linha">${linha}</p>
        <div class="cb-item-pe">${acoes}<button type="button" class="alerta-ver" data-cb-abrir="${esc(c.ocorrenciaId)}">Detalhes</button></div>
        ${acoes ? formularios(c) : ''}
      </article>`;
  }

  // Lista da aba, por grupo. Vazia: uma frase calma.
  GC.htmlCobrancas = function (perfil = GC.perfil) {
    const { grupos } = GC.cobrancas.grupos(perfil);
    const cheios = grupos.filter((g) => g.itens.length);
    if (!cheios.length) {
      const msg = perfil && GC.visaoDe(perfil) === 'pasta' ? 'Nenhuma cobrança do prefeito para a sua pasta.' : 'Você não tem cobranças em aberto.';
      return GC.htmlCalmo ? GC.htmlCalmo(msg, 'decisao-vazio') : `<p class="decisao-vazio">${msg}</p>`;
    }
    return cheios.map((g) => `<h3 class="alertas-divisor cb-grupo ${g.conta ? 'conta' : ''}">${esc(g.titulo)} · ${g.itens.length}</h3>${g.itens.map((c) => item(c, perfil)).join('')}`).join('');
  };

  // Reduz a foto para caber no armazenamento: JPEG de até 640 px de lado. Também usada pela operação da pasta.
  GC.reduzirFoto = reduzirFoto;
  function reduzirFoto(arquivo) {
    return new Promise((resolve) => {
      if (!arquivo) return resolve(null);
      const leitor = new FileReader();
      leitor.onerror = () => resolve(null);
      leitor.onload = () => {
        const img = new Image();
        img.onerror = () => resolve(null);
        img.onload = () => {
          const escala = Math.min(1, 640 / Math.max(img.width, img.height));
          const tela = document.createElement('canvas');
          tela.width = Math.round(img.width * escala);
          tela.height = Math.round(img.height * escala);
          tela.getContext('2d').drawImage(img, 0, 0, tela.width, tela.height);
          resolve(tela.toDataURL('image/jpeg', 0.7));
        };
        img.src = leitor.result;
      };
      leitor.readAsDataURL(arquivo);
    });
  }

  // Lê o formulário e devolve o pedido para GC.cobrancas.
  async function dadosDo(form) {
    const f = new FormData(form);
    const txt = (f.get('texto') || '').toString();
    const tipo = form.dataset.cbTipo;
    if (tipo === 'previsao') return { minutos: Number(f.get('outros')) || Number(f.get('minutos')) || 0, texto: txt };
    if (tipo === 'justificativa') return { motivo: f.get('motivo') || '', area: f.get('area') || null, texto: txt };
    if (tipo === 'recurso') return { pedido: f.get('pedido') || '', texto: txt };
    if (tipo === 'novo_prazo') return { horas: Number(f.get('horas')) || 0, texto: txt };
    if (tipo === 'evidencia') {
      const arq = form.querySelector('input[type=file]').files[0];
      return { texto: txt, foto: await reduzirFoto(arq) };
    }
    return { texto: txt };
  }

  // Liga os cliques num contêiner (bloco da gaveta ou lista da aba).
  // acoes: { executar(acao, id, dados) → { ok, motivo }, abrir(ocorrenciaId), aoConcluir?() }
  GC.ligarCobranca = function (raiz, acoes) {
    if (!raiz || raiz.dataset.cbLigado) return;
    raiz.dataset.cbLigado = '1';
    raiz.addEventListener('click', (e) => {
      const alvo = e.target.closest('[data-cb], [data-cb-form], [data-cb-fechar], [data-cb-abrir]');
      if (!alvo || !raiz.contains(alvo)) return;
      if (alvo.matches('[data-cb]')) { e.stopPropagation(); acoes.executar(alvo.dataset.cb, alvo.dataset.cbId, {}); return; }
      if (alvo.matches('[data-cb-form]')) {
        e.stopPropagation();
        const dono = alvo.closest('[data-cb-bloco], .cb-item');
        dono.querySelectorAll('.cb-form').forEach((f) => { f.hidden = f.dataset.cbTipo !== alvo.dataset.cbForm || !f.hidden; });
        const aberto = dono.querySelector(`.cb-form[data-cb-tipo="${alvo.dataset.cbForm}"]:not([hidden])`);
        if (aberto) { const campo = aberto.querySelector('input:not([type=radio]), select, textarea'); if (campo) campo.focus(); }
        return;
      }
      if (alvo.matches('[data-cb-fechar]')) { e.stopPropagation(); alvo.closest('.cb-form').hidden = true; return; }
      // Clique no item (fora de botão e de formulário): abre o detalhe da ocorrência.
      if (e.target.closest('.cb-form')) return;
      acoes.abrir(alvo.dataset.cbAbrir);
    });
    raiz.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.target.matches('.cb-item[data-cb-abrir]')) acoes.abrir(e.target.dataset.cbAbrir);
    });
    raiz.addEventListener('change', (e) => {
      if (e.target.name === 'motivo') {
        const so = e.target.closest('form').querySelector('.cb-so-outra');
        if (so) so.hidden = e.target.value !== 'outra_pasta';
      }
      if (e.target.name === 'outros' && e.target.value) e.target.closest('form').querySelectorAll('input[name=minutos]').forEach((r) => { r.checked = false; });
    });
    raiz.addEventListener('submit', async (e) => {
      const form = e.target.closest('.cb-form[data-cb-tipo]'); // os da operação da pasta têm data-op-tipo
      if (!form) return;
      e.preventDefault();
      e.stopPropagation();
      const botao = form.querySelector('[type=submit]');
      botao.disabled = true;
      const r = acoes.executar(form.dataset.cbTipo, form.dataset.cbId, await dadosDo(form)) || { ok: false };
      botao.disabled = false;
      if (!r.ok) { form.querySelector('.cb-erro').textContent = GC.ERROS_COBRANCA[r.motivo] || 'Não deu certo. Tente de novo.'; return; }
      // Enviado: fecha o formulário e redesenha (a lista esperava o formulário fechar para redesenhar).
      form.hidden = true;
      if (acoes.aoConcluir) acoes.aoConcluir();
    });
  };
})(window.GC = window.GC || {});
