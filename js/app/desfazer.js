(function (GC) {
  // Desfazer e confirmar no painel (regras em js/desfazer.js, janela e aviso em js/desfazer-ui.js).
  // O app.js passa cada ação por `com` (fotografa antes, guarda o que mudou e mostra "Desfazer") e as críticas por
  // `confirmarAntes` (pede confirmação e só então executa). Desfazer volta os registros guardados, as ocorrências
  // e, se a ação era da operação da pasta, avisa as outras abas por um evento "desfazer" no registro da operação.
  const cidade = () => (GC.cidade ? GC.cidade.id : 'media');

  GC.criarAppDesfazer = function (app) {
    const { store } = app;
    // Chave guardada → quem relê nesta aba (as outras abas releem pelo evento storage).
    const registros = () => ({
      [GC.CHAVE_COBRANCAS]: () => GC.cobrancas && GC.cobrancas.recarregar(),
      [GC.CHAVE_AJUDAS]: () => GC.ajudas && GC.ajudas.recarregar(),
      [GC.CHAVE_ACOES_PREFEITO]: () => GC.acoesPrefeito && GC.acoesPrefeito.recarregar(),
      [GC.CHAVE_PACTOS]: () => GC.pactos && GC.pactos.recarregar(),
      [GC.CHAVE_REGRAS]: () => GC.regrasAlerta && GC.regrasAlerta.recarregar(),
      [GC.CHAVE_PEDIDOS]: () => GC.pedidos && GC.pedidos.recarregar(),
      [GC.CHAVE_MODELOS_CRISE]: () => GC.modelosCrise && GC.modelosCrise.recarregar(),
      [GC.CHAVE_SAZONAL]: () => GC.registroSazonal && GC.registroSazonal.recarregar(),
      [GC.CHAVE_TAREFAS]: () => GC.tarefas && GC.tarefas.recarregar(),
      [GC.CHAVE_PRAZOS]: () => GC.parametrosPrazo && GC.parametrosPrazo.recarregar(),
      [`gc.gabinetes.${cidade()}`]: () => app.telas && app.telas.gabinetes.recarregar(),
    });
    const ls = (() => { try { return window.localStorage; } catch (e) { return null; } })();
    const reg = GC.criarDesfazer({
      armazenamento: ls ? {
        ler: (k) => { try { return ls.getItem(k); } catch (e) { return null; } },
        gravar: (k, v) => { try { if (v == null) ls.removeItem(k); else ls.setItem(k, v); } catch (e) { /* sem armazenamento */ } },
      } : null,
      chaves: () => Object.keys(registros()).filter((k) => k && k !== 'undefined'),
      recarregar: (k) => { const f = registros()[k]; if (f) f(); },
    });
    GC.desfazer = reg;

    let gravando = 0; // ação dentro de ação (lote, cobrança que resolve): só a de fora vira um "Desfazer"

    // fn: a ação; devolve true ou { ok }. opcoes: { rotulo (texto ou (resultado) → texto), ocorrencias: ids que ela
    // pode mudar, operacao: true se for gesto da pasta (as outras abas aplicam o desfazer), depois?(item) ao desfazer }.
    function com(fn, opcoes = {}) {
      if (gravando) return fn();
      gravando++;
      let foto = null;
      let r;
      try {
        foto = reg.fotografar({ store, ocorrencias: opcoes.ocorrencias || [] });
        r = fn();
      } finally { gravando--; }
      const ok = r === true || (r && r.ok === true);
      if (ok && foto) {
        foto.fixar();
        const rotulo = typeof opcoes.rotulo === 'function' ? opcoes.rotulo(r) : opcoes.rotulo;
        const it = reg.registrar({ rotulo: rotulo || 'Ação feita', foto, operacao: !!opcoes.operacao, depois: opcoes.depois || null });
        if (it && GC.mostrarDesfazer) GC.mostrarDesfazer(it, () => desfazerUltimo());
      }
      return r;
    }

    const MOTIVO = {
      mudou: 'Não deu para desfazer: alguém mexeu nisso depois (a secretaria respondeu ou a ocorrência andou).',
      nada: 'Nada para desfazer agora.',
    };
    function desfazerUltimo() {
      const r = reg.desfazer();
      if (!r.ok) { if (GC.avisoDesfazer) GC.avisoDesfazer(MOTIVO[r.motivo] || 'Não deu para desfazer.'); return r; }
      const it = r.item;
      const ids = Object.keys(r.retratos || {});
      // Gesto da pasta: as outras abas (o prefeito vendo, o diretor) também voltam a ocorrência.
      if (it.operacao && ids.length && GC.operacao) {
        const o = store.buscar(ids[0]);
        const e = GC.operacao.registrar({ tipo: 'desfazer', oid: ids[0], retratos: r.retratos, rotulo: it.rotulo, area: o ? o.area : null, titulo: o ? o.titulo : '', quem: (GC.usuarioAtual && GC.usuarioAtual() || {}).nome || 'Secretaria' });
        if (e && app.marcarOperacaoAplicada) app.marcarOperacaoAplicada(e.id);
      }
      if (GC.auditar) GC.auditar('acao_desfeita', { alvo: it.rotulo, areaAlvo: ids.length && store.buscar(ids[0]) ? store.buscar(ids[0]).area : null, ref: ids.length ? { tipo: 'ocorrencia', id: ids[0] } : null });
      if (it.depois) it.depois(it);
      app.render();
      const aberta = app.gaveta && app.gaveta.abertaId();
      if (aberta) app.gaveta.atualizar(store.buscar(aberta), true);
      if (GC.avisoDesfazer) GC.avisoDesfazer(`Desfeito: ${it.rotulo}`, true);
      return r;
    }

    // Ação crítica: abre a janela e devolve { ok: false, motivo: 'confirmar' } na hora (o formulário fica aberto).
    // Confirmada, executa de novo com { confirmado: true }; cancelada, limpa o recado do formulário.
    const RECADO = 'Confirme na janela que abriu.';
    function confirmarAntes(chave, alvo, dados, executar) {
      if ((dados && dados.confirmado) || !GC.confirmar) return null;
      const txt = GC.confirmacaoDe(chave, alvo, dados);
      if (!txt) return null;
      GC.confirmar(Object.assign({ perigo: true }, txt)).then((sim) => {
        if (!sim) {
          document.querySelectorAll('.cb-erro').forEach((e) => { if (e.textContent === RECADO) e.textContent = ''; });
          return;
        }
        const r = executar(Object.assign({}, dados || {}, { confirmado: true }));
        if (r === true || (r && r.ok)) {
          // O formulário que pediu a ação fecha; as listas que esperavam por ele redesenham.
          document.querySelectorAll('.cb-form:not([hidden])').forEach((f) => { f.hidden = true; });
          app.render();
          const aberta = app.gaveta && app.gaveta.abertaId();
          if (aberta) app.gaveta.atualizar(store.buscar(aberta), true);
        } else if (r && r.motivo && GC.avisoDesfazer) GC.avisoDesfazer('Não deu certo. A situação mudou enquanto a janela estava aberta.');
      });
      return { ok: false, motivo: 'confirmar' };
    }
    GC.RECADO_CONFIRMAR = RECADO;

    // Ctrl+Z (ou ⌘+Z) fora de campo de texto desfaz a última ação.
    document.addEventListener('keydown', (e) => {
      if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey || e.key.toLowerCase() !== 'z') return;
      const t = e.target;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      if (!reg.ultimo()) return;
      e.preventDefault();
      desfazerUltimo();
    });

    return { com, confirmarAntes, desfazerUltimo, registro: reg };
  };
})(window.GC = window.GC || {});
