# Etiquetas — Fatia B (Itens operacional) — Plano

> **Para workers agênticos:** SUB-SKILL: superpowers:subagent-driven-development. Passos com checkbox.

**Goal:** Reformar Etiquetas › Itens no layout 2 colunas (catálogo à esquerda; "Etiqueta selecionada" + fila de impressão à direita), imprimindo via Niimbot B1, reusando o renderizador (modelo da Config) e a geração de validade/lote/registro do servidor.

**Architecture:** Rota de admin nova `POST /etiquetas/registrar` (espelha o `/registrar` do quiosque, reusa `criarEtiquetaComLote`+`validadeDe`, responsável em texto livre) → `AbaItens` 2 colunas: catálogo (`GET /etiquetas/itens`, editável + "Usar" + item manual) + painel "Etiqueta selecionada" (prévia via `desenharEtiqueta` com o `modelo`/`fonte` da Config) + **Sequência de impressão** (fila → registrar→desenhar→`imprimir` por item).

**Tech Stack:** Express+Prisma 7 (backend), React/Vite + canvas + Web Bluetooth (`niimbotB1`).

## Global Constraints

- **Rota de admin roda DENTRO do gate**: `empresaId = getEmpresaIdAtual()`; `findFirst` sem empresaId já filtra pela loja (extension); `create` injeta empresaId. **NUNCA `req.user.empresaId`**. `etiquetaImpressa`/`insumo`/`etiquetaRegra`/`etiquetaItemConfig` estão em `MODELS_TENANT`.
- **Validade/lote/datas geradas no SERVIDOR** (fonte da verdade) — o cliente nunca inventa o `validoAte`/`lote` do registro; o override de dias é aplicado no servidor.
- **Largura do canvas trava em 384px** (`imprimir` valida) — reusa `desenharEtiqueta`.
- **`conectado()` pode mentir** após queda → reconectar manual; a fila só imprime se conectado.
- Item `ativo:false` (override) → a rota RECUSA (paridade com o quiosque).
- Não quebrar o quiosque nem `GET/PUT /etiquetas/itens`.
- Cores da marca (tokens `--brand-gold`/`--app-surface`/`--app-highlight`), tema-aware.
- Commit por task na `main`, sem push (o controlador dá push). NUNCA `taskkill /IM node.exe` — só `kill %1`.

---

### Task 1: Backend — `POST /api/etiquetas/registrar` (admin)

**Files:**
- Modify: `backend/server.js` (novo handler perto do `/public/etiquetas/:token/registrar` ~7461)

**Interfaces:**
- Consumes: `criarEtiquetaComLote(dados)`, `validadeDe({manipuladoEmMs,conservacao,regras,itemConfig})`, `getEmpresaIdAtual()`, `ETIQUETA_TIPOS_INSUMO`, `exigirAdmin`.
- Produces: `POST /api/etiquetas/registrar` → `{ ok, etiqueta }` (etiqueta com `nomeItem/conservacao/tempLabel/manipuladoEm/validoAte/validadeDias/lote/responsavelNome`).

- [ ] **Step 1:** Adicionar o handler (espelha o do quiosque, mas admin + texto livre + override):
```js
app.post('/api/etiquetas/registrar', async (req, res) => {
  if (!exigirAdmin(req, res)) return;
  try {
    const empresaId = getEmpresaIdAtual();
    const b = req.body || {};
    const insumoId = b.insumoId ? parseInt(b.insumoId, 10) : null;
    const nomeAvulso = typeof b.nomeAvulso === 'string' ? b.nomeAvulso.trim().slice(0, 120) : '';
    if (!insumoId && !nomeAvulso) return res.status(400).json({ error: 'Escolha um item ou informe o nome.' });

    let nomeItem = nomeAvulso, itemConfig = null;
    if (insumoId) {
      const insumo = await prisma.insumo.findFirst({ where: { id: insumoId, ativo: true, tipo: { in: ETIQUETA_TIPOS_INSUMO } } });
      if (!insumo) return res.status(404).json({ error: 'Item não encontrado.' });
      nomeItem = insumo.nome;
      itemConfig = await prisma.etiquetaItemConfig.findFirst({ where: { insumoId } });
      if (itemConfig?.ativo === false) return res.status(400).json({ error: 'Este item está desativado para etiquetagem.' });
    }

    const responsavelNome = typeof b.responsavelNome === 'string' ? b.responsavelNome.trim().slice(0, 120) : '';
    if (!responsavelNome) return res.status(400).json({ error: 'Informe o responsável (quem manipulou).' });

    const manipuladoEmMs = b.manipuladoEm ? Date.parse(b.manipuladoEm) : Date.now();
    if (!Number.isFinite(manipuladoEmMs)) return res.status(400).json({ error: 'Data de manipulação inválida.' });

    const regras = await prisma.etiquetaRegra.findMany({ where: { ativo: true } });
    let calc;
    try { calc = validadeDe({ manipuladoEmMs, conservacao: b.conservacao, regras, itemConfig }); }
    catch (e) { return res.status(e.http || 400).json({ error: e.msg || 'Conservação inválida.' }); }

    // Override opcional de validade (dias) — aplicado NO SERVIDOR, mantendo o tempLabel da regra.
    const override = b.validadeDias == null || b.validadeDias === '' ? null : parseInt(b.validadeDias, 10);
    let validoAte = calc.validoAte, validadeDias = calc.dias;
    if (override !== null) {
      if (!Number.isFinite(override) || override < 1 || override > 3650) return res.status(400).json({ error: 'Validade deve ser de 1 a 3650 dias.' });
      validadeDias = override;
      validoAte = new Date(manipuladoEmMs + override * 86400000);
    }

    const quantidade = Math.min(50, Math.max(1, parseInt(b.quantidade, 10) || 1));
    let etiqueta;
    try {
      etiqueta = await criarEtiquetaComLote({
        empresaId, insumoId, nomeItem, conservacao: b.conservacao, tempLabel: calc.tempLabel,
        manipuladoEm: new Date(manipuladoEmMs), validoAte, validadeDias,
        responsavelId: null, responsavelNome, dispositivoId: null, quantidade,
      });
    } catch (e) { if (e?.http) return res.status(e.http).json({ error: e.msg }); throw e; }
    res.status(201).json({ ok: true, etiqueta });
  } catch (err) { console.error('[etiquetas/registrar admin]', err); res.status(500).json({ error: 'Erro ao registrar a etiqueta.' }); }
});
```
- [ ] **Step 2:** `node --check backend/server.js`.
- [ ] **Step 3 (smoke):** script node temporário em `backend/` (removê-lo depois) que usa o prisma client dentro de um `tenantStore.run({empresaId}, ...)` para: garantir setup (regras), chamar a MESMA lógica (ou o endpoint via fetch se subir o server — preferir o script direto), e conferir que um registro nasce com `lote` não-vazio, `responsavelNome` correto, `validoAte` = manip + regra, e que o **override** de dias muda o `validoAte`. Se subir o server, matar só com `kill %1` — NUNCA `taskkill`.
- [ ] **Step 4:** Commit.

---

### Task 2: Frontend — `AbaItens` 2 colunas + "Etiqueta selecionada" + prévia + Imprimir agora

**Files:**
- Modify: `frontend/src/pages/Etiquetas.jsx` (`AbaItens`)
- Modify: `frontend/src/styles/global.css` (`.etqi-*`)

**Interfaces:**
- Consumes: `GET /etiquetas/itens` (`{itens:[{insumoId,nome,tipo,unidade,conservacaoPadrao,validadeDias,validadeEfetiva,ativo}], conservacoes}`), `PUT /etiquetas/itens/:insumoId` (edição inline — já existe), `GET /etiquetas/config` (`{config:{modelo,fonte,razaoSocial,cnpj,sif,sie,alturaMm},regras:[{conservacao,tempLabel,dias}],conservacoes}`), `POST /etiquetas/registrar` (Task 1). `desenharEtiqueta`/`niimbotB1` (Fatia A).

- [ ] **Step 1:** Ler o `AbaItens` atual inteiro. Preservar a edição inline (conservação/validade/ativo via `PUT /etiquetas/itens/:insumoId`) e a busca.
- [ ] **Step 2 (dados de apoio):** No mount, além dos itens, buscar `GET /etiquetas/config` → guardar `config` (modelo/fonte/identificação p/ a prévia) e `regras` (mapa conservação→`{tempLabel,dias}`). Conectar Niimbot no padrão da Fatia A (`bluetoothDisponivel`/`conectar`/`conectado`; botão Conectar/Reconectar; `conn` state).
- [ ] **Step 3 (layout 2 colunas `.etqi-grid`):** ESQUERDA = catálogo: busca + tabela (Nome · Conservação[select inline] · Validade efetiva[input inline] · ativo) + botão **"Usar"** por linha (carrega no painel) + um campo **"Adicionar item manual"** (nome → carrega como `nomeAvulso`). DIREITA = painel "Etiqueta selecionada".
- [ ] **Step 4 (painel "Etiqueta selecionada"):** estado `sel = { insumoId|null, nomeAvulso|'', nome, conservacao, manipuladoEm(datetime-local, default agora), validadeDias(default = validadeEfetiva do item), responsavelNome, copias(1) }`. Campos: Conservação (select das `conservacoes`, default `conservacaoPadrao`), Manipulação/Abertura (datetime-local), Validade (dias) (input), Responsável (texto), Cópias (number 1–50). **Prévia** `<canvas ref>` redesenhada em `useEffect([sel, config])`: monta `dados = { nomeItem: sel.nome, conservacaoLabel: rotuloConservacao(sel.conservacao), tempLabel: regras[sel.conservacao]?.tempLabel || '', manipuladoEm: new Date(sel.manipuladoEm), validoAte: new Date(new Date(sel.manipuladoEm).getTime() + sel.validadeDias*86400000), responsavelNome: sel.responsavelNome || '—', lote: '—' }` e chama `desenharEtiqueta(previaRef, dados, config)`. Nota visível: "o código de lote real sai ao imprimir".
- [ ] **Step 5 ("Imprimir agora"):** `if (!sel.nome && !sel.nomeAvulso) return`; `if (!conectado()) notify('Conecte a impressora.','error')`; `POST /etiquetas/registrar` com `{ insumoId, nomeAvulso, conservacao, responsavelNome, manipuladoEm: new Date(sel.manipuladoEm).toISOString(), validadeDias, quantidade: copias }`; com a `etiqueta` retornada, `desenharEtiqueta(canvas, { ...dadosDaEtiqueta, conservacaoLabel, manipuladoEm:new Date(etiqueta.manipuladoEm), validoAte:new Date(etiqueta.validoAte) }, config)` e `await imprimir(canvas, { copias })`. try/catch com `notify(e?.response?.data?.error || e?.message, 'error')`. Trava o botão enquanto imprime.
- [ ] **Step 6 (CSS `.etqi-*`):** `.etqi-grid` (2 col ≥1024px, colapsa), `.etqi-cat` (tabela), `.etqi-painel` (card direito sticky se der), reusar `.etq-previa`/`.table-card`. Cores da marca.
- [ ] **Step 7:** `cd frontend && npm run build`. Conferir no browser.
- [ ] **Step 8:** Commit.

---

### Task 3: Sequência de impressão (fila)

**Files:**
- Modify: `frontend/src/pages/Etiquetas.jsx` (`AbaItens`)
- Modify: `frontend/src/styles/global.css` (`.etqi-fila*`)

**Interfaces:** Consumes tudo da Task 2.

- [ ] **Step 1 (estado da fila):** `fila = []` de `{ id, insumoId, nomeAvulso, nome, conservacao, conservacaoLabel, manipuladoEm, validadeDias, responsavelNome, copias }`. Botão **"Adicionar à fila"** no painel empurra uma cópia do `sel` (com um id local via contador — NÃO `Date.now()`/`Math.random()`; use um `useRef` incremental).
- [ ] **Step 2 (UI da fila):** card **"Sequência de impressão"** com a lista (nome · conservação · cópias · remover) + "Limpar" + contador. Empty-state "Nenhum item na fila".
- [ ] **Step 3 ("Imprimir sequência"):** `if (!conectado()) notify(...)`; para cada item da fila **em sequência**: `POST /etiquetas/registrar` → `desenharEtiqueta` → `await imprimir(canvas,{copias})`. Acumula sucesso; se um falhar, **para** e `notify` quantos saíram + qual falhou (não engole). Trava o botão (`imprimindoFila`). Ao terminar tudo, limpa a fila e avisa sucesso.
- [ ] **Step 4 (CSS `.etqi-fila*`):** linhas da fila, botão dourado "Imprimir sequência", tema-aware.
- [ ] **Step 5:** `npm run build`. Commit.

## Verificação final

`node --check backend/server.js`; smoke do `/etiquetas/registrar` (lote + validade + override); `npm run build`; a tela Itens abre em 2 colunas, "Usar" carrega o item, a prévia reflete os campos com o modelo da Config, "Imprimir agora" e "Imprimir sequência" registram (grava `EtiquetaImpressa`) e imprimem via Niimbot.
