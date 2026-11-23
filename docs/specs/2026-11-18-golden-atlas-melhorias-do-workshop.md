# Golden Atlas · melhorias do workshop de 18/11/2026

Base: o código do staging (`vila-dourada.staging.goldendev.com.br`) em 18/11, com as decisões e as próximas etapas do workshop "Projeto Vila Dourada" (Anotações do Gemini).

O que ficou de fora de propósito:

- **App mobile dedicado:** a decisão foi deixar para a fase 2.
- **Modelo de negócio e campanhas em vídeo:** não são tarefas de produto.

Todos os arquivos novos seguem o padrão do projeto:

- módulo IIFE em `GC`, sem build;
- tokens de `identidade-visual/tokens.css`;
- tom de voz sem emoji.

## 1. Módulo de gestão orçamentária

Pedido no workshop: acompanhamento orçamentário, dotações de recursos federais, contratos vigentes, prazos de vencimento e licitações. É a próxima etapa do Davi.

A tela nova é **Orçamento e contratos** (`#/orcamento` e `#/orcamento/<secretaria>`). De cima para baixo:

1. **Precisa de você.** Mostra três tipos de alerta:
   - contrato que vence sem licitação, ou com licitação que não termina a tempo;
   - recurso de fora com risco de devolução;
   - pasta com o pagamento muito atrás.
2. **Quatro números:** orçamento do ano, recursos de fora (com o valor em risco), contratos vencendo em 90 dias e licitações.
3. **Execução por secretaria.** Barra com empenhado, liquidado e pago, e o traço de onde o pago deveria estar no mês (1,5 mês de defasagem entre empenho e pagamento). Ao lado fica a **receita própria** (IPTU, ISS, ITBI, taxas e a inadimplência do IPTU).
4. **Recursos de fora do tesouro.** Mostra:
   - transferências federais e estaduais, emendas e convênios;
   - órgão, valor, quanto foi recebido e executado;
   - prazo de execução e de prestação de contas;
   - situação (risco de devolução, atenção, em dia);
   - o compromisso do plano de governo ligado ao recurso;
   - nos recursos em risco, o botão "Plano com a Maia".
5. **Contratos vigentes**, pelo vencimento, com SLA, multas e a cobertura: "Licitação termina antes", "Licitação não termina a tempo" ou "Sem licitação aberta".
6. **Licitações por fase**, de Planejamento a Homologada, com o contrato que renovam ou o recurso que usam. Mostra também se terminam a tempo.

Perfis:

- O gestor geral vê todas as pastas, com filtro por pasta.
- O setor vê só a própria pasta (`GC.rotaDoPerfil`), e o menu do setor ganhou "Orçamento da pasta".

**Maia, tema `orcamento`.** Responde sobre execução, recursos que podem ser devolvidos, contratos que vencem sem licitação e licitações, com gráfico. Exemplos de perguntas:

- "Como está o orçamento?"
- "Tem recurso federal que pode ser devolvido?"
- "Quais contratos vencem sem licitação?"

**Dados** (`js/orcamento-gestao.js`):

- A execução vem do mesmo `GC.gestao.orcamento()` do widget Orçamento.
- Os contratos vêm de `GC.gestao.contratos()`, com mais três.
- Os recursos de fora e as licitações são novos.
- Tudo escala com a população da cidade, como os outros `data-*`.

Arquivos:

- novos: `js/orcamento-gestao.js`, `js/tela-orcamento.js`, `js/ia/tema-orcamento.js`, `css/orcamento-gestao.css`;
- alterados: `index.html`, `js/rotas.js`, `js/app/telas.js`, `js/dashboard.js`, `js/perfil.js` (menu do setor, rota e matriz de permissões) e `js/contrato.js` (`abrirTela` aceita `orcamento`).

## 2. Plano de governo ligado à estratégia

Pedido: o painel do plano de governo deve refletir as metas e a estratégia principal da gestão.

- **Eixos estratégicos** no topo da tela. Cada cartão mostra:
  - a frase-objetivo do eixo;
  - quanto os compromissos andaram contra onde deveriam estar;
  - quantos estão críticos;
  - o orçamento do eixo, pago contra o previsto.

  Os eixos são "Cuidar das pessoas", "Educação que transforma", "Cidade segura e preparada" e "Cidade que funciona". Ficam em `GC.EIXOS_GOVERNO`, que cada prefeitura pode trocar.
- Nova vista **"Por eixo"**, ao lado de Por situação, Por secretaria e Por prazo.
- O cartão do compromisso mostra o **recurso de fora** ligado a ele (fonte, valor, % executado e "pode ser devolvido").

Arquivos: `js/tela-metas.js` e `css/metas.css`.

## 3. Visão resumida e perfil de acesso reduzido

Pedido: navegação mais enxuta, ou alternância entre visão simples e completa, para gestores com perfis e familiaridade com tecnologia diferentes.

**A decisão.** A visão resumida mantém o layout do painel: mapa como protagonista, cabeçalho, menu lateral, doca e as mesmas telas. Ela muda só a quantidade de informação. Ficou assim depois de duas tentativas que trocavam o layout inteiro e foram descartadas na revisão.

**Resumo de hoje** (`js/resumo-essencial.js`, `css/resumo-essencial.css`):

- **Onde fica:** é um cartão da doca, no mesmo vidro e com o mesmo cabeçalho do Resumo do dia e de "Desde a sua última visita".
- **Quando abre:** sozinho ao entrar, e fica aberto até a pessoa fechar.
- **O que traz:**
  - a manchete do dia, montada dos dados ("8 ocorrências críticas, 6 com prazo estourado", e quem concentra os atrasos);
  - quatro números (ocorrências críticas, % no prazo, compromissos concluídos, orçamento pago);
  - as 3 ocorrências que precisam de decisão, com Cobrar (confirmação na linha, depois o "Desfazer" do painel) e Ver;
  - o plano de governo por eixo e o orçamento em três linhas;
  - o botão "Perguntar à Maia: o que fazer primeiro?".
- **Dados:** os mesmos de `GC.orcamentoGestao`, `GC.metasGoverno` e da store. A doca mantém um painel aberto por vez.

**O que sai na visão resumida** (`js/visao-simples.js`, `css/visao-simples.css`):

- O **menu** fica com Mapa, Relatórios, Plano de governo, Orçamento e Demandas.
- A **doca** fica com Resumo de hoje e Indicadores.
- Saem filtros, camadas, visualizações salvas, widgets no mapa e os itens de administração do menu ⋯.

**As telas também resumem:**

- O **Plano de governo** abre na vista "Por eixo".
- O **Orçamento** para na execução e na receita, com o botão "Ver recursos de fora, contratos e licitações" para o detalhe.

**Quem decide como o painel abre é o perfil de acesso** (revisão de 19/11). Cada perfil tem "Como o painel abre" (`GC.EXIBICOES` em `js/permissoes.js`), editável em Usuários e permissões → Perfis:

| Opção | Comportamento |
|---|---|
| Completa | Abre com tudo; a pessoa pode passar para a resumida |
| Resumida | Abre com o Resumo de hoje; a pessoa pode passar para a completa |
| Só resumida | Sempre resumida, sem a troca |

Padrões de fábrica:

| Perfil | Abre na |
|---|---|
| Gestor geral | Completa |
| Secretário(a) | Completa |
| Diretor(a) de unidade | Resumida |
| Gestor (visão resumida) | Só resumida |

Regras:

- Perfil que administra usuários ou perfis não pode ser "só resumida", porque Usuários e permissões só aparece na visão completa.
- "Voltar ao padrão" também restaura essa escolha.
- A troca pelo pé do menu ("Visão resumida" ou "Visão completa") fica no navegador, por usuário (`vd-visao.<usuário>`).

**Resumo de hoje na pasta** (secretário e diretor):

- A manchete e os números são os da pasta ("Saúde: 5 ocorrências abertas, 1 com prazo estourado"), mais as cobranças do prefeito a responder e as demandas da equipe.
- No lugar de "Precisa da sua decisão" entra **"Para fazer hoje"**, a caixa de entrada do setor (`js/caixa-entrada.js`), com o passo de cada item ("Despachar equipe", "Responder", "Registrar plano de ação") levando direto a ele.
- O menu resumido do setor inclui "Minha secretaria".

**Correções de perfil:**

- O cabeçalho mostra o nome do perfil, e não "Gestor geral", para perfis da cidade que não são o gestor geral (o vice aparece como "Gestor (visão resumida)").
- O diretor aparece como "Secretaria de Saúde · Diretor(a) de unidade".
- Minha conta mostra o nome do perfil de acesso.

**Novo perfil do sistema "Gestor (visão resumida)"** (`gestor_consulta`):

- Fica sempre na visão resumida, sem a troca.
- Vê a cidade toda e não age: Cobrar não aparece para ele.
- Usuário de demonstração: **Otávio Lins, vice-prefeito**, com atalho "Visão resumida" na tela de entrada.
- `GC.papelDe` passou a respeitar papel do sistema gravado no usuário (`u.papel`), com o usuário atual guardado por 1 s.

Arquivos alterados: `index.html`, `js/app/doca.js`, `js/app/cabecalho.js`, `js/app/telas.js`, `js/dashboard.js`, `js/tela-metas.js`, `js/tela-orcamento.js`, `js/tela-perfis.js`, `css/perfis-acesso.css`, `js/app.js` (expõe `GC.appAtual`), `js/permissoes.js`, `js/perfis-acesso.js`, `js/perfil.js`, `js/data-usuarios.js` e `js/tela-entrar.js`.

**Pontos dos perfis que ficaram para decidir:**

- `GC.MATRIZ_PERMISSOES` (`js/perfil.js`) não é usada em nenhuma tela desde que os perfis passaram a ser editáveis. Ela também não traz o diretor, o servidor nem o gestor de visão resumida. Sugestão: remover, ou gerar a partir de `GC.PERFIS_SISTEMA`.
- O seletor "Trocar perfil" do menu ⋯ só oferece gestor geral, gestor do setor e servidor. Os outros perfis entram por "Ver o painel como", em Perfis.

## 4. Maia: falar e escrever para as redes

Pedidos: conversão de voz em texto e conteúdo para redes sociais, além da nota à imprensa.

**Microfone** ao lado do enviar, nas três conversas com a Maia (painel, Portal do Cidadão e portal do servidor):

- Usa o reconhecimento de fala do navegador (Web Speech API, pt-BR).
- O texto aparece no campo enquanto a pessoa fala e é enviado quando ela para.
- Em navegador sem suporte, o botão não aparece.
- Arquivos: `js/voz.js`, `css/voz.css`.

**Legenda para redes sociais.** É um rascunho novo, do tipo `post`. Com ou sem secretaria, traz:

- o que foi entregue (Agenda de entregas), os números do mês e a próxima entrega;
- uma legenda longa (Instagram e Facebook, com hashtags) e uma versão curta de até 280 caracteres (X e status do WhatsApp).

Onde aparece:

- Entra no catálogo "Escrever" das ações prontas.
- O card de redes que já existia ganhou o botão "Escrever a legenda do post".
- O card não responde mais a pedidos de "legenda".

Arquivos: `js/ia/rascunhos.js`, `js/ia/entender.js`, `js/ia-roteiro.js`, `js/ia/acoes-prontas.js`, `js/ia/cards.js`, `js/chat.js` (campo da versão curta) e `js/contrato.js` (tipo `post` e campo `curto`).

## 5. Portal do Cidadão como portal de serviços

Pedido: portal unificado com benefícios sociais, matrículas, medicamentos, tributos e refinanciamentos, começando no WhatsApp e terminando na plataforma.

Nova seção **"Serviços da Prefeitura"**, com cinco serviços. Cada um abre um painel:

| Serviço | O que o painel mostra |
|---|---|
| Benefícios sociais | Simulação pela renda e pelo número de pessoas (Bolsa Família, Tarifa Social, CadÚnico, auxílio-aluguel) e o agendamento no CRAS |
| Matrícula e vagas | Escolas e creches com vaga agora (de `GC.educacao`) |
| Remédios na farmácia | Em que UBS o remédio tem hoje (de `GC.medicamentos`) |
| IPTU e Refis | Simulador à vista, 12× e 36×, com o desconto nos encargos |
| Atendimento pelo WhatsApp | O fluxo "começa lá, termina aqui com gov.br" |

Os botões de WhatsApp usam o número de Personalização. Sem número, eles não aparecem.

Arquivos:

- novos: `js/portal-servicos.js`, `css/cidadao-servicos.css`;
- alterados: `cidadao.html` e `js/portal-cidadao.js` (animação de entrada da seção).

## 6. Servidor com demandas da secretaria

Próxima etapa do Davi: localizar um perfil de servidor que tenha demandas geradas pela secretaria.

Na primeira abertura, por cidade e por navegador, as secretarias passam 6 demandas de exemplo aos servidores. A Ana Lima (Defesa Civil), o servidor do atalho da tela de entrada, recebe duas. Assim o portal do servidor e a tela Demandas não começam vazios.

Arquivo: `js/tarefas-demo.js` (carregado no `index.html` e no `servidor.html`).

## 7. Correção encontrada no caminho

Na **cidade pequena**, `js/data-transito.js` e `js/data-habitacao.js` quebravam porque buscavam bairros que não existem nela. Agora, um bairro que não existe cai num bairro da cidade, sempre o mesmo para o mesmo id. O problema também acontece no staging atual.

## 8. Revisão de 19/11: portal do morador e visão resumida em todas as telas

Retorno da revisão: a versão anterior ainda parecia quase igual ao staging, inclusive no portal do morador, e a visão
resumida cortava telas em vez de resumir cada uma.

### Portal do morador (`cidadao.html`)

A identidade e o estilo das seções ficam os mesmos. A ordem mudou para os serviços virem primeiro:

1. **Barra de acessibilidade** no alto, no padrão do gov.br (`js/portal-acessivel.js`, `css/portal-acessivel.css`):
   - tamanho do texto em três níveis (A, A+ e A++), sem mexer no mapa;
   - alto contraste (preto, branco e amarelo);
   - "Ouvir os avisos": lê a manchete e os avisos de agora com a voz do navegador, sem enviar nada para fora.

   No celular a barra cabe numa linha. A escolha fica salva no aparelho.
2. **Capa com "Mais procurados":** atalhos para pedir reparo, remédio no posto, vaga na escola, IPTU, benefícios e protocolo.
3. **Seus pedidos** com o protocolo e o andamento de cada pedido (Recebido → Encaminhado → Em campo → Resolvido).
   - Na primeira visita, dois pedidos de exemplo do registro passam a ser "deste aparelho" (`js/portal-semente.js`).
4. **"O que você precisa resolver?"** com seis cartões grandes, cada um com a sua cor. O "Pedir um reparo" entrou na
   grade e a seção antiga ficou escondida; as rotas `#/servicos` levam à grade.
5. **"Onde ser atendido"** (`#sec-regiao`):
   - a central da regional do bairro, com horário, serviços e bairros atendidos;
   - o posto de saúde mais perto, com o movimento de agora;
   - o WhatsApp da Prefeitura;
   - a lista de todas as regionais.

   As regionais são os bairros de oeste a leste, em 2 a 4 grupos.
6. **WhatsApp de demonstração** (`00 90000-0156`) no `GC.ATENDIMENTO_PADRAO`, para os botões aparecerem sem configurar.
7. **Correção no celular estreito:** o nome da cidade não fica mais por baixo do botão do bairro. Isso já acontecia no staging.

### Visão resumida em todas as telas do painel

**Menu.** Na visão resumida ele não corta mais telas: só o Cruzamento de dados (ferramenta de análise) fica de fora.

**Telas.** Cada tela mantém o layout. `js/resumo-telas.js` e `css/resumo-telas.css` fazem três coisas:

- põem uma faixa abaixo do cabeçalho dizendo o que está à vista e o que ficou na tela completa;
- recolhem os blocos de detalhe;
- encurtam as listas.

"Ver a tela completa" abre tudo ali mesmo. O que fica à vista em cada tela:

| Tela | Na visão resumida |
|---|---|
| Secretarias | O que está ruim, os números e o ranking só com abertas, atrasadas, no prazo e plano |
| Secretaria | Os indicadores da pasta e os alertas abertos |
| Gabinete de crise (lista) | As 3 decisões mais urgentes |
| Relatórios | Frases, números e "O que fazer agora", sem as tabelas detalhadas |
| Agenda de entregas | Números e as entregas do mês, sem filtros e linha do tempo |
| Calendário sazonal | O que está em curso e o que preparar, sem o ano inteiro e a tabela |
| Demandas | Até 5 por grupo, sem busca e filtros |
| Central de alertas | As 10 mais urgentes, sem filtros, recorrentes e a coluna de lote |
| Indicadores | Só os fora da meta |

**Tamanho do texto.** No menu ⋯ → Leitura, em três níveis, salvo por usuário (`js/tamanho-texto.js`).

**Trocar perfil (menu ⋯).** Ganhou "Usuários com visão resumida": o vice-prefeito e a diretora de unidade da Saúde.

### Testado

- **Painel:** sem erro no console nas varreduras de todos os perfis e cidades.
- **Portal:** sem erro no console nas três cidades, inclusive no celular (390 px), com alto contraste e com A++.

## 9. Revisão de 23/11: Minha visão e a pauta do Paulo Fiuza

### Minha visão: cada pessoa monta o próprio painel

Abre pelo pé do menu lateral, pelo menu ⋯ e pelo botão "Personalizar" da faixa de cada tela. Os arquivos são
`js/minha-visao.js` e `css/minha-visao.css`. A escolha é salva por usuário, em `gc.minha-visao.<usuário>`.

**Modelos.** São três atalhos:

- **Completa:** tudo à vista.
- **Resumida:** o mesmo layout, com o essencial.
- **Foco:** layout novo.

Se a pessoa mexe em qualquer item depois de escolher, a visão vira "Personalizada".

**Arrumação Foco.** É a mudança de layout da visão reduzida:

- o menu lateral mostra o nome de cada tela;
- as telas ficam numa coluna central;
- os números ficam grandes e os cartões e tabelas, mais folgados;
- no mapa, o Resumo de hoje fica preso numa coluna à esquerda.

**O que mais a pessoa escolhe:**

- o mapa ao abrir (completo ou simples);
- a tela inicial;
- as telas que aparecem no menu;
- os blocos de cada tela;
- o tamanho do texto.

**Blocos de cada tela.** `js/resumo-telas.js` agora dá nome aos blocos: filtros, ranking, linha do tempo, tabelas e
assim por diante. O modelo Resumida esconde os de detalhe, e a pessoa liga e desliga cada um. A faixa da tela diz o
que ficou de fora e tem dois botões:

- **"Ver a tela completa":** vale só para aquela visita;
- **"Personalizar":** abre a Minha visão já na tela.

**Perfil "só resumida"** (por exemplo, o vice). A pessoa personaliza a arrumação, o menu e o texto. Os blocos de
detalhe e o mapa completo ficam travados.

### Pauta do Paulo Fiuza

| Item | O que entrou | Arquivos |
|---|---|---|
| Maia em voz | Alto-falante ao lado do microfone nas três conversas: lê as respostas novas em voz alta (Web Speech, pt-BR) | `js/voz.js`, `css/voz.css` |
| Eixos editáveis e PDF | "Editar eixos" no Plano de governo: nome, objetivo, ícone, pastas, eixo novo ou retirado. "PDF do plano": placar, um bloco por eixo e a tabela dos compromissos | `js/plano-eixos.js`, `js/tela-metas.js`, `css/metas.css` |
| Regras do orçamento e ofício | "Regras de alerta" na tela Orçamento: limites de devolução de recurso, janela de licitação, prazo crítico e atraso da pasta. "Ofício com a Maia" para recurso em risco e "Memorando com a Maia" para contrato sem licitação a tempo; copia, baixa PDF ou ajusta com a Maia | `js/orcamento-gestao.js`, `js/orcamento-oficio.js`, `js/tela-orcamento.js` |
| Agenda de publicação | Tela `#/publicacoes`: semana em calendário, fila de aprovação, agendados e publicados. O post que a Maia escreve entra na fila; nada sai sem aprovação | `js/tela-publicacoes.js`, `js/ia-roteiro.js` |
| Governança da Maia | Tela `#/governanca`: o que a Maia pode em cada perfil (dois princípios travados: não publica sozinha, não mostra dado pessoal), o registro do que ela fez e os alertas de conformidade | `js/tela-governanca.js` |
| Portal: benefício e matrícula com protocolo | "Marcar atendimento no CRAS" e "Pedir a vaga" pelo portal, com protocolo e andamento em "Suas solicitações" | `js/portal-servicos.js`, `cidadao.html` |
| Fontes e integrações | Tela `#/fontes`: 17 fontes com o jeito de chegar, a última atualização, a situação, as telas que usam e "Pedir atualização" | `js/tela-fontes.js` |

**Onde ficam as telas novas:**

- **Agenda de publicação:** menu lateral, no gestor geral e no setor.
- **Governança da Maia e Fontes e integrações:** menu ⋯ → Administração.
- O CSS das três está em `css/telas-novas.css`.

**Auditoria.** Ganhou as ações novas: Minha visão, ofício, regras, eixos, PDF, publicações, fontes e permissões da Maia.

### Testado

- **Varredura sem erro no console**, incluindo as três telas novas:
  - gestor geral;
  - setor (Saúde e Defesa Civil);
  - vice;
  - diretora;
  - cidade pequena e grande;
  - portal, servidor e entrada.
- **Minha visão:** conferida nos três modelos e com o perfil travado.
- **Fluxos de ponta a ponta:**
  - regras e ofício (o PDF baixa);
  - eixos e PDF do plano;
  - post da Maia entrando na agenda;
  - solicitações com protocolo no portal.

## Como foi testado

- **Navegação:** sem erro no console, no Chromium, em todas as telas do gestor geral e nas telas principais do setor (Saúde), do vice-prefeito (visão resumida), da cidade pequena e da grande.
- **Outras páginas:** Portal do Cidadão, portal do servidor e tela de entrada.
- **Maia:** perguntas de orçamento, de contratos, de recursos e de legenda conferidas.
- **Não rodados:** os testes de `tests/` do repositório não estavam no staging. Vale rodar `npm test` antes do merge, principalmente `permissoes.test.js`, por causa do perfil novo.
