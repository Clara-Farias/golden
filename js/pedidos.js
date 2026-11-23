(function (GC) {
  // Pedidos do cidadão (spec: docs/specs/2026-11-12-vila-dourada-pedido-do-cidadao-design.md).
  // O morador abre um pedido no portal (cidadao.html) com tipo, ponto, foto e descrição e recebe um protocolo.
  // Pedidos do mesmo tipo perto um do outro viram um ponto só, com contador de relatos. O painel transforma cada
  // ponto numa ocorrência (GC.aplicarPedidos) e grava de volta a situação que o morador lê. Este registro é a
  // verdade compartilhada entre as abas (localStorage, evento storage): o portal nunca lê a situação da própria store.
  // Só lógica, sem DOM.

  const MIN = 60000;
  // Tipos que o portal aceita: o tipo de ocorrência que já existe e o raio em que dois relatos são o mesmo problema.
  GC.TIPOS_PEDIDO = [
    { id: 'buraco', tipo: 'buraco', nome: 'Buraco na rua', icone: 'road', raioM: 50, area: 'infraestrutura' },
    { id: 'iluminacao', tipo: 'iluminação pública', nome: 'Poste apagado', icone: 'bulb-off', raioM: 30, area: 'infraestrutura' },
    { id: 'arvore', tipo: 'queda de árvore', nome: 'Árvore caída ou poda', icone: 'trees', raioM: 30, area: 'defesa_civil' },
    { id: 'entulho', tipo: 'entulho', nome: 'Lixo ou entulho', icone: 'trash', raioM: 80, area: 'limpeza' },
    { id: 'vazamento', tipo: 'vazamento de água', nome: 'Vazamento de água', icone: 'droplet', raioM: 100, area: 'infraestrutura' },
    { id: 'bueiro', tipo: 'bueiro', nome: 'Bueiro entupido', icone: 'grid-dots', raioM: 40, area: 'limpeza' },
  ];
  GC.tipoPedido = (id) => GC.TIPOS_PEDIDO.find((t) => t.id === id || t.tipo === id) || null;
  GC.SITUACOES_PEDIDO = { recebido: 'Recebido', encaminhado: 'Encaminhado', em_campo: 'Em campo', resolvido: 'Resolvido' };
  const ORDEM = ['recebido', 'encaminhado', 'em_campo', 'resolvido'];
  GC.MAX_FOTOS_PEDIDO = 30;
  GC.MAX_DESCRICAO_PEDIDO = 300;
  GC.FOTO_PEDIDO_MAX_BYTES = 150 * 1024;
  const SEQ_INICIAL = 4800;

  const texto = (t) => String(t == null ? '' : t).trim();
  const bytesDaFoto = (foto) => Math.round((String(foto).split(',')[1] || '').length * 0.75);
  // Distância em metros (aproximação plana, como em js/store.js).
  GC.distanciaM = function (a, b) {
    if (![a.lat, a.lng, b.lat, b.lng].every(Number.isFinite)) return Infinity;
    const kx = 111320 * Math.cos(((a.lat + b.lat) / 2) * Math.PI / 180);
    return Math.hypot((a.lng - b.lng) * kx, (a.lat - b.lat) * 110540);
  };
  const tituloDe = (tp, bairroId) => {
    const b = (GC.data && GC.data.bairros.find((x) => x.id === bairroId)) || { nome: bairroId };
    return `${tp.nome} · ${b.nome} (pedido de morador)`;
  };

  // Limite de relatos da regra que vale para a ocorrência (condição relatos_app); null se a regra não mede relatos.
  GC.limiteRelatos = function (regra) {
    const c = ((regra && regra.condicoes) || []).find((x) => x.metrica === 'relatos_app' && (x.operador === '>=' || x.operador === '>'));
    return c ? (c.operador === '>' ? c.valor + 1 : c.valor) : null;
  };

  // Situação pública de uma ocorrência da store: o que o morador lê no protocolo.
  GC.situacaoDoPedido = function (o) {
    if (!o) return null;
    const sec = ((GC.data.areas.find((a) => a.id === o.area) || {}).secretaria || { nome: 'Secretaria' }).nome;
    if (o.status === 'resolvida' && o.duplicadaDe) return { juntadoA: o.duplicadaDe };
    if (o.status === 'resolvida') {
      const ev = o.evidencia || {};
      return { situacao: 'resolvido', detalhe: 'Serviço feito', evidencia: { texto: ev.texto || 'A equipe concluiu o serviço no local.', foto: ev.foto || null, t: ev.t || o.resolvidaEm || GC.agora() } };
    }
    if (o.status === 'em_campo') return { situacao: 'em_campo', detalhe: 'Equipe no local' };
    if (o.equipeId) return { situacao: 'encaminhado', detalhe: 'Equipe a caminho' };
    if ((o.devolucoes || []).length) return { situacao: 'encaminhado', detalhe: `Passou para a ${sec}` };
    return { situacao: 'encaminhado', detalhe: `Na fila da ${sec}` };
  };

  // Estado inicial a partir dos pedidos de demonstração (js/data-pedidos.js): tempos relativos viram datas.
  function semente(agora) {
    const ini = (GC.data && GC.data.pedidosIniciais) || { pontos: [], pedidos: [] };
    const t = agora();
    const pontos = ini.pontos.map((p) => {
      const criadoEm = t - (p.haMin || 0) * MIN;
      const linha = (p.linha || [['recebido', 'Pedido recebido', p.haMin || 0]]).map(([situacao, txt, haMin]) => ({ t: t - haMin * MIN, situacao, texto: txt }));
      return {
        id: p.id, tipo: p.tipo, area: p.area, bairroId: p.bairroId, lat: p.lat, lng: p.lng, relatos: p.relatos, criadoEm,
        ocorrenciaId: p.ocorrenciaId || null, situacao: p.situacao, detalhe: p.detalhe || null, situacaoEm: linha[linha.length - 1].t,
        linha, evidencia: p.evidencia ? Object.assign({ foto: null, t: t - (p.evidencia.haMin || 0) * MIN }, p.evidencia) : null,
        juntadoA: null, simular: false,
      };
    });
    const pedidos = ini.pedidos.map((x, k) => ({
      protocolo: `${new Date(t).getFullYear()}-${String(SEQ_INICIAL - ini.pedidos.length + k).padStart(6, '0')}`,
      pontoId: x.pontoId, criadoEm: t - (x.haMin || 0) * MIN, descricao: x.descricao || '', foto: null, meu: false,
      avaliacao: x.avaliacao ? Object.assign({ t: t - (x.avaliacao.haMin || 0) * MIN, inicial: true }, x.avaliacao) : null,
    }));
    return { seq: SEQ_INICIAL, pontos, pedidos };
  }

  GC.criarPedidos = function ({ armazenamento, agora = () => (GC.agora ? GC.agora() : Date.now()), chave = 'gc.pedidos' } = {}) {
    const memoria = {};
    const A = armazenamento || {
      ler: (k) => memoria[k],
      gravar: (k, v) => { memoria[k] = JSON.parse(JSON.stringify(v)); },
    };
    const ouvintes = new Set();
    const emitir = (tipo, extra) => ouvintes.forEach((fn) => fn(Object.assign({ tipo }, extra)));
    function ler() {
      const v = A.ler(chave);
      if (v && Array.isArray(v.pontos) && Array.isArray(v.pedidos)) return v;
      const s = semente(agora);
      A.gravar(chave, s);
      return s;
    }
    const gravar = (s) => A.gravar(chave, s);
    const falha = (motivo) => ({ ok: false, motivo });
    // Ponto que este ponto segue (juntado a outro): o fim da corrente.
    const final = (s, p) => { let x = p; for (let i = 0; x && x.juntadoA && i < 10; i++) x = s.pontos.find((y) => y.id === x.juntadoA) || x; return x; };

    // Só as N fotos mais novas ficam guardadas: as antigas perdem a foto, não o pedido.
    function limitarFotos(s) {
      const comFoto = s.pedidos.filter((x) => x.foto).sort((a, b) => b.criadoEm - a.criadoEm);
      comFoto.slice(GC.MAX_FOTOS_PEDIDO).forEach((x) => { x.foto = null; x.fotoApagada = true; });
    }
    function validarFoto(foto) {
      if (!foto) return null;
      if (!/^data:image\//.test(foto)) return 'foto';
      if (bytesDaFoto(foto) > GC.FOTO_PEDIDO_MAX_BYTES) return 'foto_grande';
      return null;
    }
    function novoPedido(s, pontoId, dados, meu) {
      s.seq += 1;
      const p = {
        protocolo: `${new Date(agora()).getFullYear()}-${String(s.seq).padStart(6, '0')}`,
        pontoId, criadoEm: agora(), descricao: texto(dados.descricao).slice(0, GC.MAX_DESCRICAO_PEDIDO), foto: dados.foto || null, meu: !!meu, avaliacao: null,
      };
      s.pedidos.push(p);
      limitarFotos(s);
      return p;
    }

    const api = {
      pontos: () => ler().pontos.slice(),
      ponto: (id) => ler().pontos.find((p) => p.id === id) || null,
      pedidos: () => ler().pedidos.slice(),
      // O ponto que a ocorrência carrega (o que não foi juntado a outro).
      daOcorrencia: (oid) => ler().pontos.find((p) => p.ocorrenciaId === oid && !p.juntadoA) || null,
      relatosDe: (pontoId) => ler().pedidos.filter((x) => x.pontoId === pontoId).sort((a, b) => b.criadoEm - a.criadoEm),
      // Pedido pelo protocolo, com o ponto que ele segue (o final da corrente de juntadas).
      doProtocolo(protocolo) {
        const s = ler();
        const p = s.pedidos.find((x) => x.protocolo === texto(protocolo));
        if (!p) return null;
        return Object.assign({}, p, { ponto: final(s, s.pontos.find((x) => x.id === p.pontoId)) });
      },
      // Pedidos abertos neste aparelho, do mais novo para o mais antigo.
      meus() {
        const s = ler();
        return s.pedidos.filter((x) => x.meu).sort((a, b) => b.criadoEm - a.criadoEm)
          .map((p) => Object.assign({}, p, { ponto: final(s, s.pontos.find((x) => x.id === p.pontoId)) }));
      },
      // Já existe pedido ou ocorrência aberta do mesmo tipo no raio? Devolve o mais perto:
      // { ponto } (já está no registro) ou { ocorrencia } (uma ocorrência da store que ainda não tem ponto).
      perto(tipoId, lat, lng, ocorrencias = []) {
        const tp = GC.tipoPedido(tipoId);
        if (!tp) return null;
        const s = ler();
        const aqui = { lat, lng };
        const cands = [];
        s.pontos.filter((p) => p.tipo === tp.id && !p.juntadoA && p.situacao !== 'resolvido')
          .forEach((p) => cands.push({ ponto: p, d: GC.distanciaM(p, aqui) }));
        ocorrencias.filter((o) => o.tipo === tp.tipo && o.status !== 'resolvida' && !s.pontos.some((p) => p.ocorrenciaId === o.id))
          .forEach((o) => cands.push({ ocorrencia: o, d: GC.distanciaM(o, aqui) }));
        const c = cands.filter((x) => x.d <= tp.raioM).sort((a, b) => a.d - b.d)[0];
        return c ? (c.ponto ? { ponto: c.ponto, distanciaM: Math.round(c.d) } : { ocorrencia: c.ocorrencia, distanciaM: Math.round(c.d) }) : null;
      },
      // Pedido novo. dados: { tipo, lat, lng, bairroId, descricao, foto, ocorrencia? } (ocorrencia: a da store que o
      // morador confirmou ser o mesmo problema; vira o ponto dela). Devolve { ok, pedido, ponto }.
      abrir(dados, { meu = true } = {}) {
        const tp = GC.tipoPedido(dados.tipo);
        if (!tp) return falha('tipo');
        if (!Number.isFinite(dados.lat) || !Number.isFinite(dados.lng)) return falha('local');
        if (!dados.bairroId || !GC.data.bairros.some((b) => b.id === dados.bairroId)) return falha('fora');
        const ruim = validarFoto(dados.foto);
        if (ruim) return falha(ruim);
        const s = ler();
        const t = agora();
        const o = dados.ocorrencia || null;
        const sit = o ? GC.situacaoDoPedido(o) : null;
        const ponto = {
          id: `pt-${s.seq + 1}`, tipo: tp.id, area: o ? o.area : (GC.areaDoTipo && GC.areaDoTipo(tp.tipo)) || tp.area, bairroId: o ? o.bairroId : dados.bairroId,
          lat: o ? o.lat : dados.lat, lng: o ? o.lng : dados.lng, relatos: 1, criadoEm: t, ocorrenciaId: o ? o.id : null,
          situacao: sit && sit.situacao ? sit.situacao : 'recebido', detalhe: sit && sit.situacao ? sit.detalhe : 'Aguardando a Prefeitura',
          situacaoEm: t, linha: [{ t, situacao: 'recebido', texto: 'Pedido recebido' }], evidencia: null, juntadoA: null, simular: !o,
        };
        if (sit && sit.situacao && sit.situacao !== 'recebido') ponto.linha.push({ t, situacao: sit.situacao, texto: sit.detalhe });
        s.pontos.push(ponto);
        const pedido = novoPedido(s, ponto.id, dados, meu);
        gravar(s);
        emitir('novo', { ponto, pedido });
        return { ok: true, pedido, ponto };
      },
      // "Também vi isso": um relato a mais num ponto aberto, com protocolo próprio.
      reforcar(pontoId, dados = {}, { meu = true } = {}) {
        const s = ler();
        const p0 = s.pontos.find((x) => x.id === pontoId);
        const p = p0 && final(s, p0);
        if (!p || p.situacao === 'resolvido') return falha('estado');
        const ruim = validarFoto(dados.foto);
        if (ruim) return falha(ruim);
        p.relatos += 1;
        const pedido = novoPedido(s, p.id, dados, meu);
        gravar(s);
        emitir('relato', { ponto: p, pedido });
        return { ok: true, pedido, ponto: p };
      },
      // A situação só anda para a frente (o detalhe pode mudar no mesmo passo). extra: { detalhe, evidencia, ocorrenciaId }.
      // Devolve true se mudou algo (e só então grava: as abas não ficam se respondendo).
      atualizar(pontoId, situacao, extra = {}) {
        if (!ORDEM.includes(situacao)) return false;
        const s = ler();
        const p = s.pontos.find((x) => x.id === pontoId);
        if (!p) return false;
        const de = ORDEM.indexOf(p.situacao);
        const para = ORDEM.indexOf(situacao);
        let mudou = false;
        if (extra.ocorrenciaId && p.ocorrenciaId !== extra.ocorrenciaId && !p.ocorrenciaId) { p.ocorrenciaId = extra.ocorrenciaId; mudou = true; }
        if (para < de) { if (mudou) gravar(s); return mudou; }
        const t = extra.t || agora();
        const detalhe = extra.detalhe || GC.SITUACOES_PEDIDO[situacao];
        if (para > de || p.detalhe !== detalhe) {
          p.situacao = situacao;
          p.detalhe = detalhe;
          p.situacaoEm = t;
          p.linha.push({ t, situacao, texto: detalhe });
          mudou = true;
        }
        if (situacao === 'resolvido' && extra.evidencia && !p.evidencia) { p.evidencia = Object.assign({ t }, extra.evidencia); mudou = true; }
        if (!mudou) return false;
        gravar(s);
        emitir('situacao', { ponto: p });
        return true;
      },
      // A ocorrência do ponto foi juntada a outra (duplicada): o ponto passa a seguir a outra. Se ela já tem ponto,
      // os relatos somam lá; senão, este ponto adota a ocorrência principal.
      juntarAOcorrencia(pontoId, principalOid) {
        const s = ler();
        const p = s.pontos.find((x) => x.id === pontoId);
        if (!p || p.juntadoA || p.ocorrenciaId === principalOid) return false;
        const outro = s.pontos.find((x) => x.ocorrenciaId === principalOid && !x.juntadoA && x.id !== p.id);
        const t = agora();
        if (outro) {
          p.juntadoA = outro.id;
          outro.relatos += p.relatos;
          p.linha.push({ t, situacao: p.situacao, texto: 'Juntado a outro pedido do mesmo problema' });
        } else {
          p.ocorrenciaId = principalOid;
          p.linha.push({ t, situacao: p.situacao, texto: 'Juntado a um atendimento que já estava aberto' });
        }
        gravar(s);
        emitir('situacao', { ponto: p });
        return true;
      },
      // Avaliação do morador: só pedido deste aparelho, com o ponto resolvido, uma vez.
      avaliar(protocolo, { resolvido, nota, comentario } = {}) {
        const s = ler();
        const p = s.pedidos.find((x) => x.protocolo === protocolo);
        if (!p || !p.meu) return falha('estado');
        const pt = final(s, s.pontos.find((x) => x.id === p.pontoId));
        if (!pt || pt.situacao !== 'resolvido') return falha('estado');
        if (p.avaliacao) return falha('ja_avaliado');
        const n = Number(nota);
        if (!Number.isInteger(n) || n < 1 || n > 5) return falha('nota');
        if (typeof resolvido !== 'boolean') return falha('resolvido');
        p.avaliacao = { nota: n, resolvido, comentario: texto(comentario).slice(0, GC.MAX_DESCRICAO_PEDIDO), t: agora() };
        gravar(s);
        emitir('avaliacao', { pedido: p, ponto: pt });
        return { ok: true, pedido: p };
      },
      // Avaliações com o bairro do ponto. { bairroId, dias, novas } (novas: sem as da demonstração inicial).
      avaliacoes({ bairroId = null, dias = null, novas = false } = {}) {
        const s = ler();
        const desde = dias ? agora() - dias * 1440 * MIN : -Infinity;
        return s.pedidos.filter((x) => x.avaliacao && x.avaliacao.t >= desde && (!novas || !x.avaliacao.inicial))
          .map((x) => Object.assign({ protocolo: x.protocolo, pontoId: x.pontoId, bairroId: (s.pontos.find((p) => p.id === x.pontoId) || {}).bairroId }, x.avaliacao))
          .filter((a) => !bairroId || a.bairroId === bairroId);
      },
      // Pontos que o portal anda sozinho quando nenhum painel está aberto (os abertos no portal, ainda sem fim).
      paraSimular: () => ler().pontos.filter((p) => p.simular && !p.juntadoA && p.situacao !== 'resolvido'),
      recarregar() { emitir('recarga', {}); },
      assinar(fn) { ouvintes.add(fn); return () => ouvintes.delete(fn); },
    };
    return api;
  };

  // Do registro para a store do painel: ponto sem ocorrência vira ocorrência (id fixo pc-<ponto>, o mesmo em
  // todas as abas); ponto com ocorrência atualiza os relatos (e a gravidade, ao passar do limite da regra).
  // Devolve as ocorrências criadas.
  GC.aplicarPedidos = function (store, pedidos, agora = () => GC.agora()) {
    const criadas = [];
    pedidos.pontos().filter((p) => !p.juntadoA).forEach((p) => {
      const oid = p.ocorrenciaId || `pc-${p.id}`;
      const o = store.buscar(oid);
      if (o) {
        if (store.relatos) store.relatos(o.id, p.relatos, GC.limiteRelatos(store.regraPara ? store.regraPara(o) : null), p.id);
        if (!p.ocorrenciaId) pedidos.atualizar(p.id, GC.situacaoDoPedido(o).situacao || p.situacao, Object.assign({ ocorrenciaId: oid }, GC.situacaoDoPedido(o)));
        return;
      }
      if (p.ocorrenciaId || p.situacao === 'resolvido' || !store.doPedido) return;
      const tp = GC.tipoPedido(p.tipo);
      const nova = store.doPedido({
        id: oid, area: p.area, tipo: tp.tipo, titulo: tituloDe(tp, p.bairroId), bairroId: p.bairroId, lat: p.lat, lng: p.lng,
        abertaHaMin: Math.max(0, Math.round((agora() - p.criadoEm) / MIN)), afetados: p.relatos, fonte: 'App Cidadão',
        status: p.situacao === 'em_campo' ? 'em_campo' : 'encaminhada', pontoId: p.id, relatos: p.relatos,
      }, GC.limiteRelatos(store.regraPara ? store.regraPara({ tipo: tp.tipo, area: p.area, bairroId: p.bairroId }) : null));
      if (!nova) return;
      criadas.push(nova);
      const sit = GC.situacaoDoPedido(nova);
      pedidos.atualizar(p.id, sit.situacao, Object.assign({ ocorrenciaId: oid }, sit));
    });
    return criadas;
  };

  // Uma ocorrência da store mudou: grava a situação no ponto que ela carrega.
  GC.sincronizarPedido = function (pedidos, o) {
    if (!o) return false;
    const p = pedidos.daOcorrencia(o.id);
    if (!p) return false;
    const sit = GC.situacaoDoPedido(o);
    if (sit.juntadoA) return pedidos.juntarAOcorrencia(p.id, sit.juntadoA);
    return pedidos.atualizar(p.id, sit.situacao, sit);
  };

  // Instância do navegador, por cidade.
  if (typeof window !== 'undefined' && window.localStorage) {
    const chave = `gc.pedidos.${GC.cidade ? GC.cidade.id : 'media'}`;
    GC.CHAVE_PEDIDOS = chave;
    GC.pedidos = GC.criarPedidos({
      chave,
      armazenamento: {
        ler(k) { try { return JSON.parse(window.localStorage.getItem(k)); } catch (e) { return null; } },
        gravar(k, v) { try { window.localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* cheio ou bloqueado: vale só nesta aba */ } },
      },
    });
  } else GC.pedidos = GC.criarPedidos();
})(window.GC = window.GC || {});
