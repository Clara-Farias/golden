(function (GC) {
  // Portal do Cidadão como portal unificado de serviços (workshop de 18/11: "integrar benefícios sociais, matrículas
  // escolares, disponibilidade de medicamentos, tributos e refinanciamentos, com o atendimento começando no WhatsApp e
  // terminando na plataforma"). Uma seção (#sec-carta) com cinco serviços; cada um abre um painel com o que dá para
  // resolver já com os dados de agora:
  //   - Benefícios sociais: simulação rápida pela renda e o caminho do CadÚnico;
  //   - Matrícula e vagas: escolas com vaga agora (js/data-educacao.js);
  //   - Remédios na farmácia: em que UBS o remédio tem hoje (js/data-medicamentos.js);
  //   - IPTU e Refis: simulador de pagamento à vista ou parcelado com desconto nos encargos;
  //   - WhatsApp: começar a conversa lá e terminar aqui com gov.br.
  // Tudo de demonstração (valores e regras simplificados). Nada sai do navegador.
  // Desde a revisão de 19/11 a grade é o primeiro bloco depois da capa (com "Pedir um reparo" e "Acompanhar um
  // pedido" dentro dela), a capa ganhou os atalhos "Mais procurados" e a seção "Onde ser atendido" (#sec-regiao)
  // mostra a central da regional, o posto de saúde mais perto e o WhatsApp.
  const esc = (t) => (GC.escaparHtml ? GC.escaparHtml(t) : String(t));
  const ic = (n) => `<i class="ti ti-${n}" aria-hidden="true"></i>`;
  const real = (v) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const nomeBairro = (id) => ((GC.data && GC.data.bairros) || []).find((b) => b.id === id)?.nome || '';
  const SALARIO_MINIMO = 1518;

  function zap(texto) {
    let n = '';
    try { n = String((GC.atendimentoPortal && GC.atendimentoPortal().whatsapp) || '').replace(/\D/g, ''); } catch (e) { n = ''; }
    if (!n) return null;
    return `https://wa.me/${n.length <= 11 ? `55${n}` : n}?text=${encodeURIComponent(texto)}`;
  }
  const botaoZap = (texto, rotulo = 'Continuar pelo WhatsApp') => {
    const url = zap(texto);
    return url ? `<a class="ps-zap" href="${esc(url)}" target="_blank" rel="noopener">${ic('brand-whatsapp')} ${esc(rotulo)}</a>` : '';
  };

  // A grade de serviços (o primeiro bloco depois da capa). 'pedidos' é um link para #/pedidos (protocolo).
  const SERVICOS = [
    { id: 'reparo', nome: 'Pedir um reparo', sub: 'Buraco, poste apagado, lixo, vazamento', icone: 'tool', cor: 'obras' },
    { id: 'remedios', nome: 'Remédio no posto', sub: 'Em que posto o remédio tem hoje', icone: 'pill', cor: 'saude' },
    { id: 'matricula', nome: 'Vaga na escola', sub: 'Escolas e creches com vaga agora', icone: 'school', cor: 'escolas' },
    { id: 'beneficios', nome: 'Benefícios sociais', sub: 'CadÚnico, Bolsa Família e auxílios', icone: 'heart-handshake', cor: 'social' },
    { id: 'iptu', nome: 'IPTU e Refis', sub: 'Segunda via e parcelamento com desconto', icone: 'receipt', cor: 'info' },
    { id: 'pedidos', nome: 'Acompanhar um pedido', sub: 'Veja em que pé está pelo protocolo', icone: 'clipboard-check', cor: 'marca', href: '#/pedidos' },
  ];
  const servico = (id) => SERVICOS.find((s) => s.id === id) || PAINEL_EXTRA[id];
  const PAINEL_EXTRA = { whatsapp: { id: 'whatsapp', nome: 'Atendimento pelo WhatsApp', icone: 'brand-whatsapp' } };

  // ---- solicitações com protocolo (pauta do Paulo Fiuza, item 6: benefício e matrícula viram pedido acompanhável,
  // como o reparo). Guardadas neste aparelho (gc.solicitacoes.<cidade>); o andamento é simulado pelo tempo. ----
  const CHAVE_SOL = `gc.solicitacoes.${GC.cidade ? GC.cidade.id : 'media'}`;
  const ETAPAS_SOL = {
    cras: ['Recebida', 'Em análise', 'Atendimento marcado', 'Atendida'],
    vaga: ['Recebida', 'Em análise', 'Vaga reservada', 'Matrícula feita'],
  };
  const lerSol = () => { try { return JSON.parse(localStorage.getItem(CHAVE_SOL)) || []; } catch (e) { return []; } };
  const gravarSol = (l) => { try { localStorage.setItem(CHAVE_SOL, JSON.stringify(l)); } catch (e) { /* vale até recarregar */ } };
  const agoraMs = () => (GC.agora ? GC.agora() : Date.now());
  // Etapa pelo tempo desde o pedido: 0 até 1 min, 1 até 3 min, 2 depois (a última, a pessoa confirma no atendimento).
  const etapaSol = (s) => { const m = (agoraMs() - s.criadoEm) / 60000; return m < 1 ? 0 : m < 3 ? 1 : 2; };
  function novaSolicitacao(tipo, dados) {
    const l = lerSol();
    const n = 300 + l.length + 1;
    const ano = new Date(agoraMs()).getFullYear();
    const s = Object.assign({ id: `sol-${Date.now().toString(36)}`, tipo, protocolo: `S-${ano}-${String(n).padStart(6, '0')}`, criadoEm: agoraMs() }, dados);
    l.unshift(s);
    gravarSol(l);
    return s;
  }
  function htmlSolicitacoes() {
    const l = lerSol();
    if (!l.length) return '';
    return `<section class="p-card" aria-labelledby="t-sol">
        <div class="p-card-cab"><h2 id="t-sol">${ic('file-certificate')} Suas solicitações</h2><small class="ps-sol-dica">benefícios e matrícula</small></div>
        <ul class="pp-lista pp-lista-passos">${l.slice(0, 4).map((x) => {
          const k = etapaSol(x);
          const et = ETAPAS_SOL[x.tipo] || ETAPAS_SOL.cras;
          return `<li><div class="pp-item"><span class="pp-item-ic">${ic(x.tipo === 'vaga' ? 'school' : 'heart-handshake')}</span>
              <span class="pp-item-txt"><b>${esc(x.titulo)}</b><small>Protocolo ${esc(x.protocolo)} · ${esc(new Date(x.criadoEm).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }))}</small>
              <small>${esc(k >= 2 ? x.depois : x.antes)}</small></span><span class="pp-chip ${k >= 2 ? 'em_campo' : 'recebido'}">${esc(et[k])}</span></div>
            <ol class="pp-passos" aria-label="Andamento">${et.map((n, i) => `<li class="${i < k ? 'feito' : i === k ? 'agora' : ''}"${i === k ? ' aria-current="step"' : ''}><span aria-hidden="true">${i < k ? ic('check') : i + 1}</span>${esc(n)}</li>`).join('')}</ol></li>`;
        }).join('')}</ul>
      </section>`;
  }
  function desenharSolicitacoes() {
    const el = document.getElementById('sec-solicitacoes');
    if (el) el.innerHTML = htmlSolicitacoes();
  }

  // ---- painéis ----
  function painelReparo() {
    const tipos = GC.TIPOS_PEDIDO || [];
    const tel = GC.telefonePrefeitura ? GC.telefonePrefeitura() : '156';
    return `<p>Escolha o problema. Você marca o lugar no mapa, manda uma foto se puder e recebe um número de protocolo.</p>
      <ul class="ps-reparos">${tipos.map((t) => `<li><a class="ps-reparo" href="#/pedir/${esc(t.id)}">${ic(t.icone)}<span>${esc(t.nome)}</span>${ic('arrow-right')}</a></li>`).join('')}</ul>
      <p class="ps-pe">${ic('phone')} Prefere ligar? <a href="tel:${esc(String(tel).replace(/[^\d+]/g, ''))}"><b>${esc(tel)}</b></a> ${botaoZap('Oi! Quero pedir um reparo na minha rua.', 'Pedir pelo WhatsApp')}</p>`;
  }
  function painelBeneficios() {
    return `<p>Responda duas perguntas para ver o que a sua família pode pedir. A confirmação é feita no CRAS, com o Cadastro Único atualizado.</p>
      <form class="ps-form" data-ps-form="beneficios">
        <label>Renda total da família por mês <input type="number" name="renda" min="0" step="50" value="1200" inputmode="numeric"></label>
        <label>Pessoas na casa <input type="number" name="pessoas" min="1" max="15" value="4" inputmode="numeric"></label>
      </form>
      <div class="ps-resultado" data-ps-res="beneficios"></div>
      <p class="ps-pe">${ic('info-circle')} Leve RG ou CPF de todos da casa e um comprovante de endereço ao CRAS do seu bairro. ${botaoZap('Oi! Quero agendar a atualização do meu Cadastro Único no CRAS.', 'Agendar no CRAS pelo WhatsApp')}</p>
      <div class="ps-pedir"><button type="button" class="p-btn" data-ps-pedir="cras">${ic('calendar-plus')} Marcar atendimento no CRAS pelo portal</button><small>Você recebe um protocolo e acompanha aqui.</small></div>
      <p class="ps-feito" data-ps-feito="cras" role="status"></p>`;
  }
  function resultadoBeneficios(f) {
    const renda = Math.max(0, Number(f.renda.value) || 0);
    const pessoas = Math.max(1, Number(f.pessoas.value) || 1);
    const porPessoa = renda / pessoas;
    const lista = [
      { nome: 'Bolsa Família', ok: porPessoa <= 218, texto: 'renda de até R$ 218 por pessoa' },
      { nome: 'Tarifa Social de Energia', ok: porPessoa <= SALARIO_MINIMO / 2, texto: 'até meio salário mínimo por pessoa' },
      { nome: 'Cadastro Único', ok: porPessoa <= SALARIO_MINIMO / 2 || renda <= SALARIO_MINIMO * 3, texto: 'até meio salário por pessoa ou 3 salários no total' },
      { nome: 'Auxílio-aluguel municipal', ok: porPessoa <= SALARIO_MINIMO / 3, texto: 'famílias em área de risco ou despejo, até 1/3 do salário por pessoa' },
    ];
    return `<p class="ps-renda">Renda por pessoa: <b>${real(porPessoa)}</b></p>
      <ul class="ps-lista">${lista.map((b) => `<li class="${b.ok ? 'ok' : 'nao'}">${ic(b.ok ? 'circle-check' : 'circle-minus')} <span><b>${esc(b.nome)}</b> <small>${b.ok ? 'pode ter direito' : 'provavelmente não'} · ${esc(b.texto)}</small></span></li>`).join('')}</ul>`;
  }

  function painelMatricula() {
    const r = GC.educacao ? GC.educacao.resumo() : null;
    const comVaga = r ? r.escolas.map((e) => Object.assign({}, e, { vagas: Math.max(0, (e.capacidade || 0) - (e.alunos || 0)) })).filter((e) => e.vagas > 0).sort((a, b) => b.vagas - a.vagas).slice(0, 6) : [];
    const lista = comVaga.length ? `<ul class="ps-lista">${comVaga.map((e) => `<li class="ok">${ic('school')} <span><b>${esc(e.nome)}</b> <small>${esc(nomeBairro(e.bairroId) || e.bairro || '')}${(nomeBairro(e.bairroId) || e.bairro) ? ' · ' : ''}${e.vagas} ${e.vagas === 1 ? 'vaga' : 'vagas'} agora</small></span></li>`).join('')}</ul>` : '<p class="ps-vazio">As vagas por escola aparecem aqui quando a rede estiver ligada.</p>';
    return `<p>Matrícula e transferência pela internet, com gov.br. Escolha até três escolas; a Secretaria de Educação responde em até 5 dias úteis.</p>
      ${lista}
      <p class="ps-pe">${ic('id-badge-2')} Tenha à mão a certidão de nascimento e o comprovante de endereço. ${botaoZap('Oi! Quero fazer a matrícula do meu filho(a) na rede municipal.', 'Começar a matrícula pelo WhatsApp')}</p>
      ${comVaga.length ? `<div class="ps-pedir ps-form"><label>Escola <select data-ps-escola>${comVaga.map((e) => `<option value="${esc(e.nome)}">${esc(e.nome)} (${e.vagas} ${e.vagas === 1 ? 'vaga' : 'vagas'})</option>`).join('')}</select></label>
        <label>Etapa <select data-ps-etapa><option>Creche (0 a 3 anos)</option><option>Pré-escola (4 e 5 anos)</option><option selected>Ensino fundamental</option></select></label>
        <button type="button" class="p-btn" data-ps-pedir="vaga">${ic('school')} Pedir a vaga pelo portal</button></div>
      <p class="ps-feito" data-ps-feito="vaga" role="status"></p>` : ''}`;
  }

  function painelRemedios() {
    const fs = GC.medicamentos && GC.data.medicamentos ? GC.medicamentos.farmacias() : [];
    const nomes = fs.length ? fs[0].itens.map((x) => ({ id: x.id, nome: x.nome })) : [];
    if (!nomes.length) return '<p class="ps-vazio">A consulta de remédios aparece aqui quando a rede de farmácias estiver ligada.</p>';
    return `<p>Escolha o remédio e veja em que posto tem hoje. A lista é a da farmácia básica do município, retirada com receita do SUS.</p>
      <label class="ps-busca">Remédio <select data-ps-remedio>${nomes.map((m) => `<option value="${esc(m.id)}">${esc(m.nome)}</option>`).join('')}</select></label>
      <div class="ps-resultado" data-ps-res="remedios"></div>`;
  }
  function resultadoRemedios(id) {
    const fs = GC.medicamentos.farmacias();
    const rotulo = { ok: 'tem', atencao: 'tem pouco', critico: 'acabando', ruptura: 'em falta', excesso: 'tem' };
    const linhas = fs.map((f) => ({ f, i: f.itens.find((x) => x.id === id) })).filter((x) => x.i)
      .sort((a, b) => (a.i.situacao === 'ruptura') - (b.i.situacao === 'ruptura') || b.i.dias - a.i.dias);
    return `<ul class="ps-lista">${linhas.map(({ f, i }) => {
      const cls = i.situacao === 'ruptura' ? 'nao' : i.situacao === 'critico' ? 'pouco' : 'ok';
      return `<li class="${cls}">${ic(cls === 'nao' ? 'circle-x' : cls === 'pouco' ? 'alert-circle' : 'circle-check')} <span><b>${esc(f.nome)}</b> <small>${esc(nomeBairro(f.bairroId))} · ${rotulo[i.situacao] || 'tem'}</small></span></li>`;
    }).join('')}</ul>`;
  }

  function painelIptu() {
    return `<p>Pague o IPTU em atraso com desconto nos juros e na multa (Refis 2026, até 30 de dezembro). Simule:</p>
      <form class="ps-form" data-ps-form="iptu">
        <label>Valor do imposto em atraso <input type="number" name="valor" min="0" step="50" value="2400" inputmode="numeric"></label>
      </form>
      <div class="ps-resultado" data-ps-res="iptu"></div>
      <p class="ps-pe">${ic('file-invoice')} A segunda via e o boleto do Refis saem com o CPF ou a inscrição do imóvel. ${botaoZap('Oi! Quero a segunda via do IPTU e simular o Refis.', 'Pedir o boleto pelo WhatsApp')}</p>`;
  }
  function resultadoIptu(f) {
    const v = Math.max(0, Number(f.valor.value) || 0);
    const encargos = v * 0.32; // juros e multa acumulados (demonstração)
    const opcoes = [
      { nome: 'À vista', parcelas: 1, desconto: 0.9 },
      { nome: 'Em 12 vezes', parcelas: 12, desconto: 0.7 },
      { nome: 'Em 36 vezes', parcelas: 36, desconto: 0.5 },
    ].map((o) => { const total = v + encargos * (1 - o.desconto); return Object.assign(o, { total, parcela: Math.max(total / o.parcelas, o.parcelas > 1 ? 50 : 0) }); });
    return `<p class="ps-renda">Hoje, com juros e multa: <b>${real(v + encargos)}</b></p>
      <ul class="ps-opcoes">${opcoes.map((o) => `<li><b>${esc(o.nome)}</b><span>${o.parcelas > 1 ? `${o.parcelas} × ${real(o.parcela)}` : real(o.total)}</span><small>${Math.round(o.desconto * 100)}% de desconto nos encargos · economia de ${real(v + encargos - o.total)}</small></li>`).join('')}</ul>`;
  }

  function painelWhatsapp() {
    const url = zap('Oi! Preciso de um serviço da Prefeitura.');
    return `<p>O atendimento pode começar no WhatsApp e terminar aqui, com segurança:</p>
      <ol class="ps-passos">
        <li><b>Mande um “oi”</b> para o WhatsApp da Prefeitura e diga o que precisa, por texto ou áudio.</li>
        <li><b>A Maia entende o pedido</b> (reparo, matrícula, remédio, IPTU, benefício) e já responde o que for simples.</li>
        <li><b>Para concluir</b>, você recebe um link para este portal e entra com gov.br. O pedido fica com protocolo e você acompanha por aqui.</li>
      </ol>
      ${url ? `<p class="ps-pe"><a class="ps-zap grande" href="${esc(url)}" target="_blank" rel="noopener">${ic('brand-whatsapp')} Abrir o WhatsApp da Prefeitura</a></p>` : '<p class="ps-vazio">O número do WhatsApp é configurado em Personalização.</p>'}`;
  }

  const PAINEIS = { reparo: painelReparo, beneficios: painelBeneficios, matricula: painelMatricula, remedios: painelRemedios, iptu: painelIptu, whatsapp: painelWhatsapp };

  function montar(el) {
    let aberto = null;
    function render() {
      const s = aberto ? servico(aberto) : null;
      el.innerHTML = `<header class="p-secao-cab ps-cab"><div><p class="p-rotulo">Serviços da Prefeitura</p><h2 id="t-carta">O que você precisa resolver?</h2></div></header>
        <p class="p-secao-sub">Toque no que precisa. O que for simples resolve aqui mesmo; o resto começa pelo WhatsApp e termina aqui, com gov.br.</p>
        <ul class="ps-grade">${SERVICOS.map((x) => {
          const miolo = `<span class="ps-ic">${ic(x.icone)}</span><span class="ps-txt"><b>${esc(x.nome)}</b><small>${esc(x.sub)}</small></span><span class="ps-seta">${ic(x.href ? 'arrow-right' : (aberto === x.id ? 'chevron-up' : 'chevron-down'))}</span>`;
          return `<li>${x.href
            ? `<a class="ps-card ps-${x.cor}" href="${x.href}">${miolo}</a>`
            : `<button type="button" class="ps-card ps-${x.cor}${aberto === x.id ? ' aberto' : ''}" data-ps="${x.id}" aria-expanded="${aberto === x.id}" aria-controls="ps-painel">${miolo}</button>`}</li>`;
        }).join('')}</ul>
        ${s ? `<div class="ps-painel ps-${s.cor || 'marca'}" id="ps-painel" role="region" aria-label="${esc(s.nome)}">
            <div class="ps-painel-cab"><h3>${ic(s.icone)} ${esc(s.nome)}</h3><button type="button" class="p-x" data-ps-fechar aria-label="Fechar ${esc(s.nome)}">${ic('x')}</button></div>
            ${PAINEIS[aberto]()}</div>` : ''}`;
      atualizar();
    }
    function atualizar() {
      const fb = el.querySelector('[data-ps-form="beneficios"]');
      if (fb) el.querySelector('[data-ps-res="beneficios"]').innerHTML = resultadoBeneficios(fb);
      const fi = el.querySelector('[data-ps-form="iptu"]');
      if (fi) el.querySelector('[data-ps-res="iptu"]').innerHTML = resultadoIptu(fi);
      const sr = el.querySelector('[data-ps-remedio]');
      if (sr) el.querySelector('[data-ps-res="remedios"]').innerHTML = resultadoRemedios(sr.value);
    }
    function abrir(id, { rolar = true } = {}) {
      aberto = id;
      render();
      const p = el.querySelector('.ps-painel');
      if (p && rolar && p.scrollIntoView) setTimeout(() => p.scrollIntoView({ block: 'center', behavior: 'smooth' }), 30);
      const h = p && p.querySelector('h3');
      if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
    }
    el.addEventListener('click', (e) => {
      const pedir = e.target.closest('[data-ps-pedir]');
      if (pedir) {
        const tipo = pedir.dataset.psPedir;
        let s;
        if (tipo === 'cras') {
          const dia = new Date(agoraMs() + 3 * 86400000); dia.setHours(9, 30, 0, 0);
          const quando = dia.toLocaleString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
          s = novaSolicitacao('cras', { titulo: 'Atendimento no CRAS · Cadastro Único', antes: 'A equipe do CRAS está vendo o melhor horário.', depois: `Marcado: ${quando}. Leve documento de todos da casa.` });
        } else {
          const escola = (el.querySelector('[data-ps-escola]') || {}).value || 'Escola municipal';
          const etapa = (el.querySelector('[data-ps-etapa]') || {}).value || '';
          s = novaSolicitacao('vaga', { titulo: `Vaga · ${escola}`, antes: `${etapa}. A Secretaria de Educação confere a vaga e os documentos.`, depois: 'Vaga reservada por 5 dias úteis: confirme a matrícula na escola com a certidão de nascimento.' });
        }
        const fb = el.querySelector(`[data-ps-feito="${tipo}"]`);
        if (fb) fb.innerHTML = `${ic('circle-check')} Pedido feito. Protocolo <b>${esc(s.protocolo)}</b>: acompanhe em "Suas solicitações", no alto da página.`;
        pedir.disabled = true;
        desenharSolicitacoes();
        return;
      }
      if (e.target.closest('[data-ps-fechar]')) { const era = aberto; aberto = null; render(); const b = el.querySelector(`[data-ps="${era}"]`); if (b) b.focus(); return; }
      const b = e.target.closest('[data-ps]');
      if (!b) return;
      if (aberto === b.dataset.ps) { aberto = null; render(); return; }
      abrir(b.dataset.ps, { rolar: true });
    });
    el.addEventListener('input', atualizar);
    el.addEventListener('change', atualizar);
    el.addEventListener('submit', (e) => e.preventDefault());
    render();
    return { abrir };
  }

  // ---- atalhos na capa: os serviços mais procurados, logo abaixo da busca ----
  const ATALHOS = [
    { rot: 'Pedir reparo', icone: 'tool', href: '#/pedir' },
    { rot: 'Remédio no posto', icone: 'pill', ps: 'remedios' },
    { rot: 'Vaga na escola', icone: 'school', ps: 'matricula' },
    { rot: 'IPTU e Refis', icone: 'receipt', ps: 'iptu' },
    { rot: 'Benefícios', icone: 'heart-handshake', ps: 'beneficios' },
    { rot: 'Acompanhar protocolo', icone: 'clipboard-check', href: '#/pedidos' },
  ];
  function montarAtalhos(el, carta) {
    el.innerHTML = `<p class="p-atalhos-rot">Mais procurados</p>
      <ul class="p-atalhos-lista">${ATALHOS.map((a) => `<li>${a.href
        ? `<a class="p-atalho" href="${a.href}">${ic(a.icone)} ${esc(a.rot)}</a>`
        : `<button type="button" class="p-atalho" data-ps-abrir="${a.ps}">${ic(a.icone)} ${esc(a.rot)}</button>`}</li>`).join('')}</ul>`;
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-ps-abrir]');
      if (b && carta) carta.abrir(b.dataset.psAbrir);
    });
  }

  // ---- onde ser atendido: regional, posto de saúde e WhatsApp, pelo bairro do morador ----
  const ROMANOS = ['I', 'II', 'III', 'IV', 'V'];
  const CIDADE = GC.cidade ? GC.cidade.id : 'media';
  const CHAVE_BAIRRO = `vd-meu-bairro.${CIDADE}`;
  const meuBairro = () => { try { return localStorage.getItem(CHAVE_BAIRRO) || ''; } catch (e) { return ''; } };
  // Regionais de atendimento: os bairros de oeste a leste, em 2 a 4 grupos (como a coleta seletiva da cidade grande).
  // A sede é o bairro mais populoso do grupo. Demonstração: numa prefeitura de verdade a lista vem do cadastro.
  function regionais() {
    const bs = ((GC.data && GC.data.bairros) || []).filter((b) => b.centro).slice().sort((a, b) => a.centro[1] - b.centro[1]);
    if (!bs.length) return [];
    const n = bs.length <= 6 ? 2 : bs.length <= 10 ? 3 : 4;
    const tam = Math.ceil(bs.length / n);
    const grupos = [];
    for (let i = 0; i < n; i += 1) { const g = bs.slice(i * tam, (i + 1) * tam); if (g.length) grupos.push(g); }
    return grupos.map((g, i) => {
      const sede = g.slice().sort((a, b) => (b.populacao || 0) - (a.populacao || 0))[0];
      return { id: `regional-${i + 1}`, nome: `Regional ${ROMANOS[i]}`, sede, bairros: g };
    });
  }
  function ubsPerto(bairroId) {
    const lista = (GC.data && GC.data.series && GC.data.series.lotacaoUbs) || [];
    const bs = (GC.data && GC.data.bairros) || [];
    const b = bs.find((x) => x.id === bairroId);
    const noBairro = lista.find((u) => u.bairroId === bairroId);
    if (noBairro || !b) return noBairro || lista[0] || null;
    const dist = (u) => { const c = (bs.find((x) => x.id === u.bairroId) || {}).centro; return c ? (c[0] - b.centro[0]) ** 2 + (c[1] - b.centro[1]) ** 2 : Infinity; };
    return lista.slice().sort((x, y) => dist(x) - dist(y))[0] || null;
  }
  const movimento = (pct) => (pct >= 85 ? { cls: 'cheio', txt: 'Cheia agora' } : pct >= 65 ? { cls: 'medio', txt: 'Movimento médio' } : { cls: 'calmo', txt: 'Tranquila agora' });

  function montarRegiao(el, carta) {
    let antes = null;
    function render() {
      const bid = meuBairro();
      antes = bid;
      const regs = regionais();
      const minha = regs.find((r) => r.bairros.some((b) => b.id === bid)) || null;
      const ubs = bid ? ubsPerto(bid) : null;
      const a = (GC.atendimentoPortal && GC.atendimentoPortal()) || {};
      const tel = GC.telefonePrefeitura ? GC.telefonePrefeitura() : '156';
      const telHref = String(tel).replace(/[^\d+]/g, '');
      const zapUrl = zap('Oi! Preciso de um serviço da Prefeitura.');
      const cardRegional = (r, destaque) => `<article class="pr-card${destaque ? ' pr-destaque' : ''}">
          <p class="pr-tipo">${ic('building')} Central de atendimento</p>
          <h3>${esc(r.nome)} · ${esc(r.sede.nome)}</h3>
          <p class="pr-linha">${ic('clock')} Segunda a sexta, das 8h às 17h</p>
          <p class="pr-linha">${ic('checklist')} Cadastro Único e CRAS, IPTU e Refis, matrícula, protocolo de pedidos</p>
          <p class="pr-bairros">Atende: ${r.bairros.map((b) => esc(b.nome)).join(', ')}</p>
          <div class="pr-acoes"><a class="p-btn p-btn-sec p-btn-mini" href="tel:${esc(telHref)}">${ic('phone')} Ligar ${esc(tel)}</a>${zapUrl ? `<a class="ps-zap" href="${esc(zap(`Oi! Quero atendimento na ${r.nome} (${r.sede.nome}).`))}" target="_blank" rel="noopener">${ic('brand-whatsapp')} WhatsApp</a>` : ''}</div>
        </article>`;
      const cardUbs = ubs ? (() => { const m = movimento(ubs.pct); return `<article class="pr-card">
          <p class="pr-tipo">${ic('first-aid-kit')} Posto de saúde</p>
          <h3>${esc(ubs.nome)}</h3>
          <p class="pr-linha">${ic('clock')} Segunda a sexta, das 7h às 19h</p>
          <p class="pr-mov ${m.cls}"><span class="pr-bolinha" aria-hidden="true"></span>${esc(m.txt)} · ${ubs.pct}% da capacidade</p>
          <div class="pr-acoes"><button type="button" class="p-btn p-btn-sec p-btn-mini" data-ps-abrir="remedios">${ic('pill')} Ver se tem o remédio</button></div>
        </article>`; })() : '';
      const cardZap = `<article class="pr-card pr-zap">
          <p class="pr-tipo">${ic('brand-whatsapp')} WhatsApp da Prefeitura</p>
          <h3>${a.whatsapp ? esc(a.whatsapp) : 'Fale pelo WhatsApp'}</h3>
          <ol class="pr-passos"><li>Mande um “oi” e diga o que precisa, por texto ou áudio.</li><li>A Maia responde o que for simples na hora.</li><li>Para concluir, você recebe um link e entra aqui com gov.br.</li></ol>
          <div class="pr-acoes">${zapUrl ? `<a class="ps-zap grande" href="${esc(zapUrl)}" target="_blank" rel="noopener">${ic('brand-whatsapp')} Abrir o WhatsApp</a>` : '<span class="ps-vazio">O número é configurado em Personalização.</span>'}</div>
        </article>`;
      el.innerHTML = `<header class="p-secao-cab"><div><p class="p-rotulo">Perto de você</p><h2 id="t-regiao">Onde ser atendido</h2></div></header>
        <p class="p-secao-sub">${minha ? `Para quem mora em <b>${esc(nomeBairro(bid))}</b>: a central da sua regional, o posto de saúde mais perto e o WhatsApp.` : 'Atendimento presencial nas centrais das regionais, nos postos de saúde e, de qualquer lugar, pelo WhatsApp.'}</p>
        <div class="pr-grade">${minha ? cardRegional(minha, true) + cardUbs : `<article class="pr-card pr-convite"><p class="pr-tipo">${ic('map-pin')} Seu bairro</p>
            <h3>Qual é o seu bairro?</h3><p>Com o bairro, aparecem aqui a central de atendimento da sua regional e o posto de saúde mais perto, com o movimento de agora.</p>
            <div class="pr-acoes"><button type="button" class="p-btn" data-regiao-bairro>${ic('map-pin')} Escolher meu bairro</button></div></article>`}${cardZap}</div>
        <details class="pr-todas"><summary>${ic('list-details')} Todas as ${regs.length} regionais ${ic('chevron-down', 'p-faq-seta')}</summary><div class="pr-grade">${regs.map((r) => cardRegional(r, false)).join('')}</div></details>`;
    }
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-ps-abrir]');
      if (b && carta) { carta.abrir(b.dataset.psAbrir); return; }
      if (e.target.closest('[data-regiao-bairro]')) { const x = document.getElementById('p-meu-bairro'); if (x) x.click(); }
    });
    render();
    // O bairro muda pelo diálogo do portal (mesma aba) ou em outra aba: confere de tempos em tempos.
    setInterval(() => { if (meuBairro() !== antes) render(); }, 1500);
    window.addEventListener('storage', (e) => { if (e.key === CHAVE_BAIRRO) render(); });
  }

  function iniciar() {
    let carta = null;
    const el = document.getElementById('sec-carta');
    if (el) { try { carta = montar(el); } catch (e) { console.error(e); } }
    const at = document.getElementById('p-atalhos');
    if (at) { try { montarAtalhos(at, carta); } catch (e) { console.error(e); } }
    const rg = document.getElementById('sec-regiao');
    if (rg) { try { montarRegiao(rg, carta); } catch (e) { console.error(e); } }
    desenharSolicitacoes();
    setInterval(desenharSolicitacoes, 30000);
    GC.portalServicos = { abrir: (id) => carta && carta.abrir(id), solicitacoes: lerSol };
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})(window.GC = window.GC || {});
