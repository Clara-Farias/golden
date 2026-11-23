(function (GC) {
  // Equipes de campo de cada secretaria (fictícias): 3 por pasta, com o nome do tipo de equipe da pasta.
  // A situação (livre, a caminho, no local) não fica aqui: sai das ocorrências da store (GC.situacaoEquipes,
  // em js/operacao.js). O bairro de base é escolhido na hora, porque a cidade da demonstração troca os bairros.
  GC.data = GC.data || {};
  const TIPO = {
    infraestrutura: 'Turma de manutenção',
    defesa_civil: 'Equipe da Defesa Civil',
    saude: 'Ambulância',
    educacao: 'Equipe de apoio escolar',
    seguranca: 'Viatura da Guarda',
    mobilidade: 'Equipe de trânsito',
    limpeza: 'Caminhão de coleta',
  };
  const POR_PASTA = 3;
  GC.data.equipes = Object.keys(TIPO).flatMap((area, a) => Array.from({ length: POR_PASTA }, (_, i) => ({
    id: `eq-${area}-${i + 1}`,
    area,
    nome: `${TIPO[area]} ${String(i + 1).padStart(2, '0')}`,
    base: a * POR_PASTA + i, // índice do bairro de base (resolvido com os bairros da cidade atual)
  })));
  GC.nomeEquipe = (id) => ((GC.data.equipes || []).find((e) => e.id === id) || { nome: 'Equipe' }).nome;
  GC.equipesDaArea = (area) => (GC.data.equipes || []).filter((e) => e.area === area);
})(window.GC = window.GC || {});
