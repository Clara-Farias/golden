(function (GC) {
  // Resumo em áudio (Maia): o resumo da semana escrito para ser ouvido (no carro, entre reuniões). A voz é a do
  // próprio aparelho (speechSynthesis, em português); o chat mostra o player e o roteiro, que também baixa em .txt.
  // Registra-se em js/ia/arquivos.js. O texto é montado com os mesmos dados do Resumo da semana e da tela inicial.
  if (!GC.arquivosMaia) return;
  const st = () => GC.storeAtual;
  const area = (id) => GC.data.areas.find((a) => a.id === id);
  const cidade = () => (GC.cidade ? GC.cidade.nome : 'Vila Dourada');
  const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
  const nomes = (l) => (l.length > 1 ? `${l.slice(0, -1).join('; ')} e ${l[l.length - 1]}` : l[0] || '');

  // Escrito para o ouvido: sem símbolo que a voz leia mal ("+9%" vira "mais 9 por cento").
  GC.textoParaFala = (t) => String(t)
    .replace(/(\d)\s*p\.p\./g, '$1 pontos percentuais')
    .replace(/([+-])(\d)/g, (x, s, d) => `${s === '+' ? 'mais ' : 'menos '}${d}`)
    .replace(/(\d)\s*%/g, '$1 por cento')
    .replace(/(\d),(\d)\s*h\b/g, '$1 vírgula $2 horas')
    .replace(/(\d)\s*h\b/g, '$1 horas')
    .replace(/\s*\((mês|trimestre|semana)\)/gi, ' no $1')
    .replace(/\s*·\s*/g, ', ')
    .replace(/\s{2,}/g, ' ')
    .trim();

  function montar(p) {
    const areas = p.areas ? p.areas.split(',') : null;
    const vale = (id) => !areas || areas.includes(id);
    const s = st();
    const k = s.kpis(areas);
    const t = (GC.data.tendencias || []).filter((x) => !x.area || vale(x.area));
    const fala = (x) => `${x.rotulo}, ${x.valor}`;
    const bons = t.filter((x) => x.positivo).slice(0, 3).map(fala);
    const ruins = t.filter((x) => !x.positivo).slice(0, 3).map(fala);
    // Agenda de entregas (js/data-entregas.js): as duas mais recentes do recorte.
    const entregas = GC.entregas ? GC.entregas.lista({ areas, situacao: 'entregue' }).reverse().slice(0, 2).map((e) => e.titulo)
      : (GC.data.conquistas || []).filter((x) => vale(x.area)).slice(0, 2).map((x) => x.titulo);
    const d = s.desempenho(null);
    const prazo = areas ? (d.secretarias.find((x) => x.area === areas[0]) || {}).noPrazoPct : d.resumo.noPrazoPct;
    const urgente = s.atencao(areas).todas[0];
    const partes = [
      `Resumo da semana ${areas ? `da ${area(areas[0]).secretaria.nome}` : `de ${cidade()}`}.`,
      `Agora há ${plural(k.criticas, 'ocorrência crítica aberta', 'ocorrências críticas abertas')} e ${plural(k.estouradas, 'com prazo estourado', 'com prazo estourado')}.`,
      urgente ? `O ponto mais urgente é: ${urgente.titulo}.` : '',
      ruins.length ? `Pedem atenção: ${nomes(ruins)}.` : '',
      bons.length ? `Melhoraram: ${nomes(bons)}.` : '',
      entregas.length ? `Entregas recentes: ${nomes(entregas)}.` : '',
      prazo != null ? `Nos últimos 30 dias, ${prazo}% das ocorrências foram resolvidas no prazo. A meta é 85%.` : '',
      'Fim do resumo.',
    ].filter(Boolean);
    const roteiro = GC.textoParaFala(partes.join(' '));
    return {
      titulo: 'Resumo da semana em áudio',
      roteiro,
      // Uns 150 palavras por minuto na voz do aparelho.
      segundos: Math.max(10, Math.round((roteiro.split(/\s+/).length / 150) * 60)),
      nome: 'resumo-da-semana-audio',
    };
  }

  GC.arquivosMaia.registrar('audio', {
    nome: 'Resumo em áudio',
    quando: (q) => /\baudio\b|em voz alta|para (eu )?ouvir|\bouvir\b|\bescutar\b|podcast|\bleia (o|a|pra|para)\b/.test(q),
    params: (q, ent, ctx) => ({ areas: ctx.areasPerfil ? ctx.areasPerfil.join(',') : '' }),
    montar,
    formatos: () => ['txt'],
    texto: (d) => `Resumo da semana pronto para ouvir, cerca de ${d.segundos < 60 ? `${d.segundos} segundos` : `${Math.round(d.segundos / 60)} ${Math.round(d.segundos / 60) === 1 ? 'minuto' : 'minutos'}`}. Toque em Ouvir: a voz é a do próprio aparelho.`,
    previa: (d) => ({ tipo: 'audio', texto: d.roteiro }),
    baixar: (d, formato, nome) => GC.baixarArquivo(`﻿${d.roteiro}\r\n`, `${nome}.txt`, 'text/plain;charset=utf-8'),
  });
})(window.GC = window.GC || {});
