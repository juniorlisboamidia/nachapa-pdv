# Etiquetas — Melhorias do quiosque + admin Itens — Plano

> **Para workers agênticos:** SUB-SKILL: superpowers:subagent-driven-development. Passos com checkbox.

**Goal:** Quiosque de etiquetas com lista por tipo (badge), conservação pré-selecionada, cópias e fila
de impressão (+ "Imprimir agora"); responsável selecionável (sem entregadores) no quiosque e no admin;
rótulos de conservação unificados (corrige bug). Sem migration.

**Architecture:** nova `lib/etiquetaLabels.js` (fonte única de CONS_LABEL/TIPO_*), backend só ganha
`tipo` no bootstrap + exclui entregadores, e o grosso é frontend (quiosque espelha a fila do admin).

## Global Constraints

- **Multi-tenant:** bootstrap/registrar resolvem `empresaId` pelo token (fora do gate); admin dentro do
  gate. `pin` nunca serializado. NUNCA `req.user.empresaId`.
- **Servidor manda na validade/lote:** o cliente só escolhe conservação/responsável/cópias; validade e
  lote seguem calculados no servidor. Fila = specs NÃO registradas (registra na hora de imprimir).
- **Conservação:** um único `CONS_LABEL` (lib nova) nas duas telas. Valores corretos: CONGELADO
  'Congelado', RESFRIADO_0_4 'Refrigerado', RESFRIADO_4_6 'Resfriado', AMBIENTE 'Ambiente Seco',
  DESCONGELADO 'Descongelado', ABERTO 'Produto aberto'.
- Não quebrar: o retry `pendente` do quiosque, o registro, o desenho (`desenharEtiqueta`), a impressão
  BLE (`niimbotB1`), nem o admin. Modais/telas em pt. Commit por task na `main`, sem push. Subagentes:
  NUNCA `taskkill /IM node.exe`.

---

### Task 1: Backend — `tipo` no bootstrap + excluir entregadores

**Files:** `backend/server.js`.

- [ ] **Step 1:** No `GET /api/public/etiquetas/:token/bootstrap` (~server.js:7521), no `findMany` de
  `insumo`, adicionar `tipo: true` ao `select` (hoje `{ id: true, nome: true }`). No `.map` que monta
  `itens`, incluir `tipo: i.tipo`. Resultado: `{ insumoId, nome, tipo, conservacaoPadrao, validadeDias }`.

- [ ] **Step 2:** No mesmo handler, excluir entregadores de `funcionarios` (segurança — `funcao` é texto
  livre). Antes do `.map(...).sort(...)`, filtrar:
  ```js
  const ehEntregador = (f) => /entregador|motoboy/i.test(String(f.funcao || ''))
  ```
  Como o `select` atual de `funcionario` NÃO traz `funcao`, adicione `funcao: true` ao select e aplique
  `.filter((f) => !ehEntregador(f))` antes de montar a resposta. (Não devolver `funcao` ao cliente é
  opcional — pode manter só `{id, nome, presente}` no map final.)

- [ ] **Step 3:** `node --check backend/server.js`. Commit: `feat(etiquetas): bootstrap do quiosque com
  tipo do item + exclui entregadores dos responsaveis`.

---

### Task 2: Lib de rótulos `etiquetaLabels.js` + unificar (corrige o bug)

**Files:** Create `frontend/src/lib/etiquetaLabels.js`; Modify `frontend/src/pages/EtiquetasQuiosque.jsx`,
`frontend/src/pages/Etiquetas.jsx`.

**Interfaces (produz):** `CONS_LABEL`, `TIPO_LABEL`, `TIPO_BADGE`, `TIPO_ORDEM` (exports).

- [ ] **Step 1:** Criar `frontend/src/lib/etiquetaLabels.js`:
```js
// Fonte ÚNICA dos rótulos de etiqueta — a tela de Config, a aba Itens e o quiosque tinham
// mapas soltos e DIVERGENTES (o quiosque rotulava a conservação errado, imprimindo o rótulo
// antigo no alimento). Tudo importa daqui agora.
export const CONS_LABEL = {
  CONGELADO: 'Congelado',
  RESFRIADO_0_4: 'Refrigerado',
  RESFRIADO_4_6: 'Resfriado',
  AMBIENTE: 'Ambiente Seco',
  DESCONGELADO: 'Descongelado',
  ABERTO: 'Produto aberto',
}
export const TIPO_LABEL = {
  PRODUCAO_PROPRIA: 'Produção própria',
  INGREDIENTE: 'Ingrediente',
  ACOMPANHAMENTO: 'Acompanhamento',
  HORTIFRUTI: 'Hortifruti',
  BEBIDA: 'Bebida',
  EMBALAGEM: 'Embalagem',
  OPERACIONAL: 'Operacional',
}
export const TIPO_BADGE = {
  PRODUCAO_PROPRIA: 'badge-blue',
  INGREDIENTE: 'badge-orange',
  ACOMPANHAMENTO: 'badge-red',
  HORTIFRUTI: 'badge-green',
  BEBIDA: 'badge-yellow',
  EMBALAGEM: 'badge-gray',
  OPERACIONAL: 'badge-gray',
}
// Ordem de exibição: produção própria primeiro (é o que mais usa etiqueta). Default 99.
export const TIPO_ORDEM = { PRODUCAO_PROPRIA: 0, INGREDIENTE: 1, ACOMPANHAMENTO: 2, HORTIFRUTI: 3, BEBIDA: 4 }
export const tipoOrdem = (t) => (t in TIPO_ORDEM ? TIPO_ORDEM[t] : 99)
```

- [ ] **Step 2:** Em `frontend/src/pages/Etiquetas.jsx`: **remover** o `const CONS_LABEL = {...}` local
  (que já está correto, mas para virar fonte única) e `import { CONS_LABEL, ... } from '../lib/etiquetaLabels'`.
  Confirmar que os usos de `CONS_LABEL` seguem funcionando (mesmos valores). O `CONS_ORDER`/`ordenarCons`
  locais podem ficar (são das Regras, não conflitam).

- [ ] **Step 3:** Em `frontend/src/pages/EtiquetasQuiosque.jsx`: **remover** o `const CONS_LABEL = {...}`
  local (o ANTIGO, com valores errados) e `import { CONS_LABEL } from '../lib/etiquetaLabels'`. Isso
  corrige o rótulo impresso pela cozinha.

- [ ] **Step 4:** `cd frontend && npm run build`. Commit: `fix(etiquetas): unifica CONS_LABEL numa lib
  (quiosque imprimia rotulo de conservacao antigo)`.

---

### Task 3: Quiosque — lista por tipo + 2ª tela (pré-seleção, cópias, fila)

**Files:** `frontend/src/pages/EtiquetasQuiosque.jsx`.

**Interfaces (consome):** bootstrap `itens[]` agora tem `tipo` (Task 1); `CONS_LABEL`/`TIPO_LABEL`/
`TIPO_BADGE`/`tipoOrdem` da lib (Task 2). O modelo da FILA é `AbaItens` em `Etiquetas.jsx` (estado
`fila`/`filaSeqRef`/`adicionarFila`/`removerDaFila`/`limparFila`/`imprimirSequencia`, UI "Sequência de
impressão") — **LEIA e espelhe**.

- [ ] **Step 1 (lista com badge/ordem):** na lista de itens (1ª tela), ordenar por `(tipoOrdem(i.tipo),
  nome)` e renderizar em cada item o nome + um `<span className={'badge ' + (TIPO_BADGE[i.tipo] ||
  'badge-gray')}>{TIPO_LABEL[i.tipo] || i.tipo}</span>`. A busca por nome continua (`itens.filter`).

- [ ] **Step 2 (pré-seleção da conservação):** onde o item é escolhido (o handler que abre a 2ª tela —
  hoje `setItem(...)`), setar `setConservacao(item.conservacaoPadrao || '')`. Assim, item com
  `conservacaoPadrao` já vem marcado; sem, vazio.

- [ ] **Step 3 (cópias):** novo estado `const [copias, setCopias] = useState(1)`. Campo numérico
  (1–50, `Math.min(50, Math.max(1, parseInt||1))`) na 2ª tela. Resetar pra 1 ao trocar de item.

- [ ] **Step 4 (imprimir agora com cópias):** o botão atual ("Imprimir etiqueta") vira **"Imprimir
  agora"** e passa `copias` no `imprimir(canvas, { copias })` e `quantidade: copias` no
  `POST /registrar` (hoje fixo 1). O retry `pendente` continua.

- [ ] **Step 5 (fila):** portar do admin — estado `const [fila, setFila] = useState([])`, `const
  filaSeqRef = useRef(0)`, `const [imprimindoFila, setImprimindoFila] = useState(false)`. Funções:
  - `adicionarFila()`: valida (item + conservação + responsável), empurra snapshot `{ id: ++seq,
    insumoId, nome, conservacao, responsavelId, copias }` na `fila`.
  - `removerDaFila(id)`, `limparFila()`.
  - `imprimirSequencia()`: espelha o do admin — exige `conectado()`, itera a `fila`, para cada item:
    `POST /registrar` (com o insumoId/conservacao/responsavelId/quantidade do item) → desenha o canvas
    (com o `etiqueta` devolvido, via a MESMA função `desenhar`) → `imprimir(canvas, { copias })`; conta
    feitos, remove da fila o que saiu, para no 1º erro sem pular. (Reusa a lógica de `imprimirEtiqueta`
    para 1 item — extraia uma função `registrarEImprimir(spec)` se ajudar, sem duplicar o registro/desenho.)
  - Botões: **"Imprimir agora"** + **"Adicionar à fila"** lado a lado; abaixo, um card **"Fila de
    impressão"**: `{fila.length}` itens, "Limpar", lista (nome · `CONS_LABEL[conservacao]` · `N×` ·
    Remover), e **"Imprimir sequência"** (desabilitado se vazio/imprimindo).
- [ ] **Step 6 (layout/responsável):** manter a seleção de responsável (grid) — já vem sem entregadores
  do backend. Organizar a 2ª tela: item escolhido no topo (+ "← trocar item"), Conservação, Responsável,
  Cópias, [Imprimir agora | Adicionar à fila], depois a Fila. Manter o "Vence em … (N dias)".

- [ ] **Step 7:** `npm run build`. Commit: `feat(etiquetas): quiosque com lista por tipo + copias + fila
  de impressao + conservacao pre-selecionada`.

---

### Task 4: Admin Itens — responsável selecionável + remove msg de lote

**Files:** `frontend/src/pages/Etiquetas.jsx` (`AbaItens`).

- [ ] **Step 1 (equipe interna):** no `AbaItens`, buscar a equipe (`GET /funcionarios?status=ATIVO`) no
  mount (estado `funcionarios`). Filtrar entregadores no cliente:
  `.filter((f) => !/entregador|motoboy/i.test(String(f.funcao || '')))`. (Se o GET não trouxer `funcao`,
  confira o endpoint — provavelmente traz; senão, filtra o que der.)

- [ ] **Step 2 (select do responsável):** trocar o `<input>` de "Responsável (quem manipulou)" por um
  `<select className="form-input">` com `<option value="">Selecione…</option>` + os funcionários
  (value = nome exibível `apelido||nome`, ou id — mas como o backend admin recebe `responsavelNome`,
  use o NOME como value e faça `updSel({ responsavelNome: e.target.value })`). Mantém a preservação do
  responsável entre trocas de item (o `sel.responsavelNome` continua). `selInvalido` já checa
  `!sel.responsavelNome.trim()` — segue válido.

- [ ] **Step 3 (remove msg):** apagar o bloco `<div className="page-header-sub" ...>Lote de exemplo (—)
  — o código real sai ao imprimir.</div>` (Etiquetas.jsx ~1145).

- [ ] **Step 4:** `npm run build`. Commit: `feat(etiquetas): admin Itens com responsavel selecionavel
  (equipe interna) + remove msg de lote de exemplo`.

## Verificação final

`node --check backend/server.js`; `npm run build`. No quiosque: itens ordenados por tipo com badge;
abrir um item pré-seleciona a conservação; cópias; "Imprimir agora" e a fila ("Adicionar à fila" →
"Imprimir sequência") funcionam; responsável sem entregadores; a conservação impressa bate com o admin.
No admin Itens: responsável é um select da equipe (sem entregadores) e a msg "Lote de exemplo" sumiu.
