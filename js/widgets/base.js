(function (GC) {
  // Registro do conteúdo dos widgets: cada domínio tem o seu arquivo em js/widgets/<id>.js e registra
  // GC.conteudoWidget[id] = (dadosDoPainel, opções) => html. Widget novo = arquivo novo + <script> no index.html;
  // js/widgets.js (grade, modal, edição) não muda. Este arquivo carrega antes dos domínios.
  GC.conteudoWidget = GC.conteudoWidget || {};

  // Versão pública do widget, para embutir no site da Prefeitura (embed.html). Só existe para o widget que a
  // declara, no arquivo do próprio domínio: texto para o cidadão ("você", sem termo técnico), sem ação interna,
  // sem dado de pessoa e sem atributos do mapa do painel (data-camada, data-destaque).
  //   GC.conteudoPublico[id] = { nome, descricao, opcoes?: [{ id, rotulo, valores: () => [{ id, nome }] }],
  //                              montar: (opções) => html }
  // Uma opção vem da URL do embed (?<id>=valor) ou de um <select data-opcao="<id>"> dentro do próprio widget.
  GC.conteudoPublico = GC.conteudoPublico || {};

  // Ajudantes comuns aos widgets.
  GC.widgetUtil = {
    esc: (t) => GC.escaparHtml(t),
    // Plural pelo número (tom-de-voz.md): "1 rota atrasada", "3 rotas atrasadas", nunca "rota(s)".
    plural: (n, um, varios) => `${n} ${Number(n) === 1 ? um : varios}`,
    horas: (h) => `${h.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} h`,
    nomeBairro: (id) => (GC.data.bairros.find((b) => b.id === id) || { nome: id }).nome,
    // Ícone da marca (js/icones.js) quando a página o carrega; sem ele, nada (testes).
    ic: (nome, classe) => (GC.icone ? GC.icone(nome, classe) : ''),
    // "segunda, quarta e sexta".
    // Telefone do atendimento da Prefeitura (o da Personalização, aba Portal do Cidadão), nunca fixo no texto.
    telefone: () => {
      try {
        if (GC.telefonePrefeitura) return GC.telefonePrefeitura();
        return (GC.atendimentoPortal && GC.atendimentoPortal().telefone) || '156';
      } catch (e) { return '156'; }
    },
    // Campo de escolha dentro de um widget público (embed.html redesenha com a opção escolhida).
    escolha: (opcao, rotulo, vazio, itens, atual) => `<label class="vp-campo"><span>${GC.escaparHtml(rotulo)}</span>
      <select data-opcao="${opcao}"><option value=""${atual ? '' : ' selected'}>${GC.escaparHtml(vazio)}</option>${itens
        .map((x) => `<option value="${GC.escaparHtml(x.id)}"${x.id === atual ? ' selected' : ''}>${GC.escaparHtml(x.nome)}</option>`).join('')}</select></label>`,
    listaE: (itens) => (itens.length < 2 ? itens.join('') : `${itens.slice(0, -1).join(', ')} e ${itens[itens.length - 1]}`),
  };
})(window.GC = window.GC || {});
