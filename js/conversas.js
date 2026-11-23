(function (GC) {
  // Conversas com a Maia (spec 2026-11-12, Maia v2, fase 2): várias conversas, guardadas no navegador por cidade e
  // perfil. Cada uma guarda as mensagens (para redesenhar ao reabrir) e a memória dos turnos (o que a IA entendeu),
  // que vai no contexto da próxima pergunta. Só lógica e armazenamento: o desenho fica em js/chat.js.
  const MAX_CONVERSAS = 20;
  const MAX_MENSAGENS = 80;
  const MAX_MEMORIA = 6;
  const MAX_TITULO = 60;

  const mesmoDia = (a, b) => {
    const x = new Date(a);
    const y = new Date(b);
    return x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth() && x.getDate() === y.getDate();
  };

  // armazenamento: { ler(), gravar(estado) }; agora(): relógio (o da demo, GC.agora, no painel).
  GC.criarConversas = function (armazenamento = { ler: () => null, gravar: () => {} }, { agora = () => Date.now() } = {}) {
    let estado = { atual: null, lista: [] };
    try {
      const salvo = armazenamento.ler();
      if (salvo && Array.isArray(salvo.lista)) estado = { atual: salvo.atual || null, lista: salvo.lista.filter((c) => c && c.id && Array.isArray(c.mensagens)) };
    } catch (e) { /* armazenamento ilegível: começa do zero */ }
    let seq = 0;

    const gravar = () => { try { armazenamento.gravar(estado); } catch (e) { /* sem armazenamento */ } };
    const buscar = (id) => estado.lista.find((c) => c.id === id) || null;
    const vazia = (c) => !c.mensagens.some((m) => m.autor === 'prefeito');

    function criar() {
      const t = agora();
      const c = { id: `c${t.toString(36)}${(seq++).toString(36)}`, titulo: null, criadaEm: t, atualizadaEm: t, mensagens: [], memoria: [] };
      estado.lista.unshift(c);
      // Passou do limite: some a mais antiga (nunca a atual).
      estado.lista.sort((a, b) => b.atualizadaEm - a.atualizadaEm);
      while (estado.lista.length > MAX_CONVERSAS) estado.lista.splice(estado.lista.findLastIndex((x) => x.id !== c.id), 1);
      estado.atual = c.id;
      gravar();
      return c;
    }

    function atual() {
      return buscar(estado.atual) || criar();
    }

    // Nova conversa. A atual ainda sem pergunta é reaproveitada (não acumula conversas vazias).
    function nova() {
      const c = buscar(estado.atual);
      if (c && vazia(c)) {
        c.mensagens = [];
        c.memoria = [];
        c.atualizadaEm = agora();
        gravar();
        return c;
      }
      return criar();
    }

    function abrir(id) {
      const c = buscar(id);
      if (!c) return null;
      // Sair de uma conversa vazia apaga essa conversa.
      const antes = buscar(estado.atual);
      if (antes && antes.id !== id && vazia(antes)) estado.lista = estado.lista.filter((x) => x.id !== antes.id);
      estado.atual = id;
      gravar();
      return c;
    }

    // Apagar a atual abre a mais recente que sobrou (ou uma nova).
    function apagar(id) {
      const existia = !!buscar(id);
      estado.lista = estado.lista.filter((c) => c.id !== id);
      if (estado.atual === id) {
        const proxima = estado.lista.slice().sort((a, b) => b.atualizadaEm - a.atualizadaEm)[0];
        if (proxima) estado.atual = proxima.id;
        else criar();
      }
      gravar();
      return existia;
    }

    // Mensagem desenhada no chat: { autor: 'prefeito' | 'ia' | 'secretaria', texto?, resposta?, area? }.
    function registrar(msg) {
      const c = atual();
      c.mensagens.push(Object.assign({ t: agora() }, msg));
      if (c.mensagens.length > MAX_MENSAGENS) c.mensagens.splice(0, c.mensagens.length - MAX_MENSAGENS);
      if (!c.titulo && msg.autor === 'prefeito' && msg.texto) {
        const t = String(msg.texto).trim();
        c.titulo = t.length > MAX_TITULO ? `${t.slice(0, MAX_TITULO - 1).trim()}…` : t;
      }
      c.atualizadaEm = agora();
      gravar();
    }

    // Turno entendido pela IA (o campo "memoria" da resposta) mais a pergunta que o originou.
    function lembrar(turno) {
      if (!turno || typeof turno !== 'object') return;
      const c = atual();
      c.memoria.push(turno);
      if (c.memoria.length > MAX_MEMORIA) c.memoria.splice(0, c.memoria.length - MAX_MEMORIA);
      gravar();
    }

    // Abertura do painel: a conversa de hoje continua; de outro dia (ou nenhuma), começa uma nova.
    // Devolve true quando retomou (o cumprimento é só na primeira mensagem do dia).
    function retomar() {
      const c = buscar(estado.atual);
      if (c && !vazia(c) && mesmoDia(c.atualizadaEm, agora())) return true;
      nova();
      return false;
    }

    return {
      atual,
      nova,
      abrir,
      apagar,
      registrar,
      lembrar,
      retomar,
      memoria: () => atual().memoria.slice(),
      // Grava de novo depois de editar uma mensagem guardada (o texto de um rascunho, por exemplo).
      salvar: gravar,
      // Lista para a gaveta: as que têm pergunta, da mais recente para a mais antiga (a atual sempre entra).
      lista: () => estado.lista.filter((c) => !vazia(c) || c.id === estado.atual).sort((a, b) => b.atualizadaEm - a.atualizadaEm)
        .map((c) => ({ id: c.id, titulo: c.titulo || 'Conversa nova', atualizadaEm: c.atualizadaEm, perguntas: c.mensagens.filter((m) => m.autor === 'prefeito').length, atual: c.id === estado.atual })),
    };
  };
})(window.GC = window.GC || {});
