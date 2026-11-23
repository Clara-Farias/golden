(function (GC) {
  // Demandas de exemplo (workshop de 18/11: "verificar perfis de servidores para localizar um perfil que possua
  // demandas geradas pela secretaria"). Na primeira vez que a demonstração abre nesta cidade e neste navegador, as
  // secretarias passam algumas demandas aos servidores, para o portal do servidor (servidor.html) e a tela Demandas
  // não começarem vazios. Ana Lima (Defesa Civil), o servidor dos atalhos da tela de entrada, recebe duas.
  // Só uma vez por cidade (marca em gc.tarefas.semente.<cidade>); "Limpar dados da demonstração" volta tudo ao zero.
  // Roda depois de js/tarefas.js e js/perfil.js (GC.responsaveisDemanda confere quem pode receber).
  if (!GC.tarefas || !GC.data || !GC.data.usuarios) return;
  const cidade = GC.cidade ? GC.cidade.id : 'media';
  const MARCA = `gc.tarefas.semente.${cidade}`;
  let ls = null;
  try { ls = window.localStorage; } catch (e) { ls = null; }
  if (!ls || ls.getItem(MARCA)) return;
  const H = 3600000;
  const agora = GC.agora ? GC.agora() : Date.now();
  const bairro = (...ids) => ids.find((id) => (GC.data.bairros || []).some((b) => b.id === id)) || null;
  const chefe = (area) => GC.data.usuarios.find((u) => u.perfil === 'setor' && u.area === area && u.nivel !== 'unidade') || { id: null, nome: 'Secretaria', area };
  const DEMANDAS = [
    { area: 'defesa_civil', para: 'u-defesa_civil-s1', em: 5, texto: 'Vistoriar a encosta da Rua das Pedras depois da chuva da madrugada', local: { texto: 'Rua das Pedras, altura do nº 120', bairroId: bairro('alto_da_serra') }, detalhe: 'Morador ligou no 199 avisando de rachadura no muro. Fotografar, medir e dizer se precisa interditar.' },
    { area: 'defesa_civil', para: 'u-defesa_civil-s1', em: 52, texto: 'Atualizar o cadastro das famílias da área de risco da Lagoa Azul', local: { texto: 'Área de risco da Lagoa Azul', bairroId: bairro('lagoa_azul') }, detalhe: 'Conferir telefone e número de moradores de cada casa antes da temporada de chuva.' },
    { area: 'defesa_civil', para: 'u-defesa_civil-s2', em: 26, texto: 'Testar a sirene do Alto da Serra', local: { texto: 'Praça do Alto da Serra', bairroId: bairro('alto_da_serra') }, detalhe: 'Teste de som com aviso prévio à população pelo portal.' },
    { area: 'infraestrutura', para: 'u-infraestrutura-s1', em: 20, texto: 'Trocar as lâmpadas queimadas da praça do Centro', local: { texto: 'Praça da Matriz', bairroId: bairro('centro') }, detalhe: '6 postes apagados, pedido do Portal do Cidadão.' },
    { area: 'limpeza', para: 'u-limpeza-s1', em: 8, texto: 'Recolher entulho deixado na Rua XV de Novembro', local: { texto: 'Rua XV de Novembro, esquina com a Av. Brasil', bairroId: bairro('centro') } },
    { area: 'saude', para: 'u-saude-s1', em: 30, texto: 'Fazer a busca ativa das gestantes sem pré-natal na UBS Central', local: { texto: 'UBS Central', bairroId: bairro('centro') } },
  ];
  const podem = (area) => (GC.responsaveisDemanda ? GC.responsaveisDemanda(area) : []);
  let n = 0;
  DEMANDAS.forEach((d) => {
    if (!podem(d.area).some((u) => u.id === d.para)) return; // cidade sem esta pasta ou sem este servidor
    const c = chefe(d.area);
    const r = GC.tarefas.passar({ texto: d.texto, area: d.area, responsavelId: d.para, prazoEm: agora + d.em * H, contexto: { tipo: 'avulsa' }, local: d.local, detalhe: d.detalhe }, { id: c.id, nome: c.nome, area: d.area });
    if (r.ok) n += 1;
  });
  try { ls.setItem(MARCA, String(n)); } catch (e) { /* sem armazenamento */ }
})(window.GC = window.GC || {});
