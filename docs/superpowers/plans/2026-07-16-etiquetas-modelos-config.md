# Etiquetas — Fatia A (Modelos + Prévia na Config) — Plano

> **Para workers agênticos:** SUB-SKILL: superpowers:subagent-driven-development. Passos com checkbox.

**Goal:** Reformar Etiquetas › Configuração no layout 2 colunas da referência, com 4 modelos de etiqueta selecionáveis, prévia ao vivo, conexão Niimbot B1 e impressão de teste. QR offline.

**Architecture:** Refatorar `etiquetaCanvas.desenharEtiqueta` de layout único para dispatch por `config.modelo` (4 desenhos) + escala de fonte por `config.fonte` + QR via `lib/qr.js`. `EtiquetaConfig` ganha `modelo`/`fonte`. `AbaConfig` vira 2 colunas reusando `niimbotB1`.

**Tech Stack:** React/Vite (frontend), canvas 2D, Web Bluetooth (niimbotB1), Express+Prisma 7 (backend), `qrcode-generator` (nova dep).

## Global Constraints

- **Largura da etiqueta trava em 384px** (`LARGURA_PX` de `niimbotB1`); todo modelo desenha em 384px de largura ou `imprimir()` estoura. Altura = `alturaMm * 8`.
- **Prévia/teste usam o MESMO `desenharEtiqueta` que o quiosque imprime** — nunca uma reimplementação paralela.
- **Não quebrar o quiosque** (`EtiquetasQuiosque.jsx`): a chamada `desenharEtiqueta(canvas, dados, config)` continua válida; o quiosque passa a respeitar `modelo`/`fonte` da config automaticamente.
- **Bluetooth:** exige gesto do usuário + contexto seguro; `conectado()` pode mentir após queda → UI só oferece reconectar manual, nunca reimprime sozinha.
- **Cores da marca** (tema-aware via tokens: `--brand-gold #eab802`, `--app-surface`, `--app-highlight #fdf6da`, `--app-border`), NÃO roxo.
- Commit por task direto na `main` + push. Subagentes: NUNCA `taskkill /IM node.exe` — só `kill %1` no próprio job.
- Valores de `modelo`/`fonte` inválidos no PUT → default, sem 500.

---

### Task 1: `lib/qr.js` — gerador de matriz QR (offline)

**Files:**
- Create: `frontend/src/lib/qr.js`
- Create: `frontend/src/lib/qr.test.mjs`
- Modify: `frontend/package.json` (dep `qrcode-generator`)

**Interfaces:**
- Produces: `matrizQr(texto: string) → boolean[][]` (matriz quadrada NxN; `true` = módulo preto). Determinístico. Texto vazio → matriz mínima válida (não lança).

- [ ] **Step 1:** `npm install qrcode-generator` no diretório `frontend` (dep síncrona, sem sub-deps).
- [ ] **Step 2:** Escrever `qr.js`:
```js
// Gera a matriz de módulos de um QR (offline, sem servidor). O canvas da etiqueta desenha
// a matriz como quadrados — o QR carrega os dados na própria imagem.
import qrcode from 'qrcode-generator'

export function matrizQr(texto) {
  const t = String(texto ?? '') || ' ' // string vazia quebra a lib; espaço vira QR mínimo válido
  const qr = qrcode(0, 'M') // typeNumber 0 = auto; correção M
  qr.addData(t)
  qr.make()
  const n = qr.getModuleCount()
  const m = []
  for (let r = 0; r < n; r++) {
    const linha = []
    for (let c = 0; c < n; c++) linha.push(qr.isDark(r, c))
    m.push(linha)
  }
  return m
}
```
- [ ] **Step 3:** Escrever `qr.test.mjs` (node, sem framework; `process.exit(falhou?1:0)`): matriz quadrada não-vazia p/ `'abc'`; `matrizQr('')` não lança e é quadrada; `matrizQr('x')` === `matrizQr('x')` (determinístico, compara JSON).
- [ ] **Step 4:** Rodar: `cd frontend && node src/lib/qr.test.mjs` → tudo ok.
- [ ] **Step 5:** Commit.

---

### Task 2: `etiquetaCanvas.js` — 4 modelos + fonte + QR

**Files:**
- Modify: `frontend/src/lib/etiquetaCanvas.js`
- Create: `frontend/src/lib/etiquetaCanvas.test.mjs`

**Interfaces:**
- Consumes: `matrizQr` (Task 1); `LARGURA_PX`, `dimensoes`, `fmt`, `ajustar` (já no arquivo).
- Produces: `desenharEtiqueta(canvas, dados, config)` — despacha por `config.modelo`. `dados` agora aceita `qr?: string`. Também exporta `dadosExemplo(config) → dados` (amostra fictícia para prévia/teste) e `MODELOS = [{id,nome,descr}]` (4 modelos, para a UI).

**Contrato de `dados`:** `{ nomeItem, tempLabel, conservacaoLabel, manipuladoEm: Date, validoAte: Date, responsavelNome, lote, qr?: string }`. **Contrato de `config`:** `{ alturaMm, razaoSocial, cnpj, sif, sie, modelo, fonte }`.

- [ ] **Step 1 (dispatch + fonte):** Extrair o desenho atual para `desenharClassico(ctx, dados, config, dims, k)` (onde `k` = escala de fonte: `config.fonte==='GRANDE' ? 1.18 : 1`, todas as fontes multiplicadas por `k` e arredondadas). `desenharEtiqueta` vira:
```js
export const MODELOS = [
  { id: 'CLASSICO', nome: 'Clássico', descr: 'Cabeçalho + campos em lista' },
  { id: 'VALIDADE', nome: 'Validade em destaque', descr: 'Data de validade em destaque' },
  { id: 'LATERAL_QR', nome: 'Faixa lateral + QR', descr: 'Faixa por conservação + QR' },
  { id: 'COMPACTO', nome: 'Compacto', descr: 'Minimalista p/ etiquetas pequenas' },
]
export function desenharEtiqueta(canvas, dados, config) {
  const dims = dimensoes(config)
  canvas.width = dims.largura; canvas.height = dims.altura
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, dims.largura, dims.altura)
  ctx.fillStyle = '#000'; ctx.textBaseline = 'top'
  const k = config?.fonte === 'GRANDE' ? 1.18 : 1
  const fn = { CLASSICO: desenharClassico, VALIDADE: desenharValidade, LATERAL_QR: desenharLateralQr, COMPACTO: desenharCompacto }[config?.modelo] || desenharClassico
  fn(ctx, dados, config, dims, k)
}
```
Cada `desenhar*` usa `dims.largura` (=384) e desenha as fontes via `` `bold ${Math.round(22*k)}px monospace` ``. Todos monospace (a B1 é térmica). Reusar `ajustar(ctx,texto,max)` para truncar e `fmt` para datas.
- [ ] **Step 2 (VALIDADE):** `desenharValidade` — topo: linha miúda `razaoSocial` (10px·k) + selo conservação à direita; centro: `VÁLIDO ATÉ` (11px·k, cinza `#555`) + `fmt(validoAte)` GRANDE (`bold ${28*k}px`); abaixo: `nomeItem` (`bold ${16*k}px`, centralizado, `ajustar`); rodapé: `Manip ${fmt(manipuladoEm)} · Lote ${lote} · ${responsavelNome}` (10px·k, `ajustar`).
- [ ] **Step 3 (LATERAL_QR):** `desenharLateralQr` — faixa preta vertical à esquerda (largura ~34px, altura total) com `conservacaoLabel` em branco girado −90° (`ctx.save/rotate`); área útil começa em x≈44. Cabeçalho: `razaoSocial · CNPJ` (10px·k). Nome (`bold ${18*k}px`, `ajustar` até `dims.largura-44-8`). Campos em 2 colunas (VALIDADE/MANIPULAÇÃO na esquerda, RESPONSÁVEL/LOTE na direita, `bold 9px·k` rótulo + `12px·k` valor). QR no canto inferior direito: `const m = matrizQr(dados.qr || textoPadraoQr(dados, config))`; desenhar quadrados pretos escalados para um lado ≈ `min(96, altura/2)` px, alinhado bottom-right com margem 8. Helper local `textoPadraoQr(dados, config)` monta o payload legível (ver spec).
- [ ] **Step 4 (COMPACTO):** `desenharCompacto` — `nomeItem` centralizado (`bold ${14*k}px`, `ajustar`); régua; 2 colunas: `MANIP` + `fmt(manipuladoEm)` | `VALIDADE` + `fmt(validoAte)` (rótulo `9px·k`, valor `12px·k`); faixa preta com `conservacaoLabel · tempLabel` (branco, `bold 11px·k`, centralizado); rodapé 1 linha `razaoSocial · CNPJ ${cnpj} · Lote ${lote} · ${responsavelNome}` (`8px·k`, `ajustar`).
- [ ] **Step 5 (amostra):** `dadosExemplo(config)`:
```js
export function dadosExemplo() {
  const agora = new Date(2026, 5, 17, 14, 30) // fixo: sem Date.now() para prévia estável
  return { nomeItem: 'Molho especial da casa', tempLabel: '0 a 4 °C', conservacaoLabel: 'Resfriado',
    manipuladoEm: agora, validoAte: new Date(2026, 5, 22, 14, 30), responsavelNome: 'Diego Alves',
    lote: 'MOL-170626-01', qr: null }
}
```
(o `qr` nulo → LATERAL_QR usa `textoPadraoQr`).
- [ ] **Step 6 (teste):** `etiquetaCanvas.test.mjs` (node): stub mínimo de canvas (`{ width:0,height:0, getContext:()=>ctxStub }` onde `ctxStub` tem no-ops p/ `fillRect/fillText/save/restore/rotate/translate/measureText(()=>({width:10}))/beginPath/fillStyle/font/textBaseline/textAlign/fillRect`). Para cada `MODELOS[i].id`: `desenharEtiqueta(canvas, dadosExemplo(), {alturaMm:40, modelo:id, fonte:'NORMAL', razaoSocial:'X', cnpj:'1'})` **não lança** e `canvas.width===384`. Idem `fonte:'GRANDE'`. Rodar `cd frontend && node src/lib/etiquetaCanvas.test.mjs`.
- [ ] **Step 7:** Commit.

---

### Task 3: Backend — `modelo`/`fonte` na config

**Files:**
- Modify: `backend/prisma/schema.prisma` (model `EtiquetaConfig`)
- Create: `backend/prisma/migrations/20260716360000_etiqueta_modelo/migration.sql`
- Modify: `backend/server.js` (`PUT /api/etiquetas/config` ~7119)

**Interfaces:**
- Produces: `GET /api/etiquetas/config` passa a incluir `modelo`/`fonte` no `config`; `PUT` aceita e saneia ambos.

- [ ] **Step 1 (schema):** No model `EtiquetaConfig` adicionar:
```
  modelo       String   @default("CLASSICO")
  fonte        String   @default("NORMAL")
```
- [ ] **Step 2 (migration):** `migration.sql`:
```sql
ALTER TABLE "EtiquetaConfig" ADD COLUMN "modelo" TEXT NOT NULL DEFAULT 'CLASSICO';
ALTER TABLE "EtiquetaConfig" ADD COLUMN "fonte" TEXT NOT NULL DEFAULT 'NORMAL';
```
- [ ] **Step 3 (aplicar):** `cd backend && npx prisma migrate deploy && npx prisma generate`.
- [ ] **Step 4 (PUT):** No `PUT /api/etiquetas/config`, adicionar ao objeto de update:
```js
const MODELOS_OK = new Set(['CLASSICO', 'VALIDADE', 'LATERAL_QR', 'COMPACTO']);
const FONTES_OK = new Set(['NORMAL', 'GRANDE']);
// ...dentro do data do update:
modelo: MODELOS_OK.has(req.body?.modelo) ? req.body.modelo : (atual?.modelo || 'CLASSICO'),
fonte: FONTES_OK.has(req.body?.fonte) ? req.body.fonte : (atual?.fonte || 'NORMAL'),
```
(usar o registro atual como fallback; se o handler não lê o atual, ler antes ou cair no default fixo). `GET` já devolve `config` inteiro — nada a mudar lá.
- [ ] **Step 5:** `node --check backend/server.js`. Smoke: `GET`/`PUT` devolvem/aceitam `modelo`/`fonte` (ou conferir no build).
- [ ] **Step 6:** Commit.

---

### Task 4: `AbaConfig` — 2 colunas + prévia + teste

**Files:**
- Modify: `frontend/src/pages/Etiquetas.jsx` (`AbaConfig`)
- Modify: `frontend/src/styles/global.css` (classes `.etq-*`)

**Interfaces:**
- Consumes: `desenharEtiqueta`, `dadosExemplo`, `MODELOS` (Task 2); `bluetoothDisponivel`, `conectar`, `conectado`, `imprimir` (`niimbotB1`); `GET/PUT /etiquetas/config` com `modelo`/`fonte` (Task 3).

- [ ] **Step 1 (imports + estado):** Importar de `../lib/etiquetaCanvas` e `../lib/niimbotB1`. Estado: `config` (já existe, agora com `modelo`/`fonte`; default `CLASSICO`/`NORMAL` se vier null), `conn` (`{nome}` ou null), `imprimindo`. `ref` do canvas de prévia.
- [ ] **Step 2 (prévia):** `useEffect` que redesenha o canvas de prévia a cada mudança de `config` (modelo/fonte/alturaMm/razaoSocial/cnpj/sif/sie): `desenharEtiqueta(previaRef.current, dadosExemplo(), config)`. Envolver num container com `overflow:auto` (a etiqueta pode ser mais alta que a área).
- [ ] **Step 3 (layout 2 colunas):** Substituir o `<div style={{maxWidth:720}}>` por grid `.etq-grid` (2 colunas ≥1024px, 1 abaixo). ESQUERDA: card **Impressora** (status `conn ? conn.nome : 'não conectada'` + botão Conectar/Reconectar → `conectar().then(setConn).catch(notify)`, desabilitado se `!bluetoothDisponivel()` com aviso), card **Identificação** (como hoje), card **Tamanho e fonte** (select altura 30/40/50 + "Personalizar" → input; select fonte Normal/Grande), card **Regras de validade** (como hoje). DIREITA: card **Modelo e prévia** com os 4 `MODELOS` como cartões selecionáveis (`.etq-modelo` + `.is-on` no `config.modelo`), o `<canvas ref={previaRef}>` numa moldura `.etq-previa`, o botão **Imprimir etiqueta de teste** e a legenda (`${largura}×${alturaMm} mm · fonte ${fonte} · 203 dpi`).
- [ ] **Step 4 (teste de impressão):** `async function imprimirTeste()`: se `!conectado()` → `notify('Conecte a impressora primeiro.','error')` + return; desenha `dadosExemplo()` num canvas temporário (ou reusa o de prévia) e `await imprimir(canvas, {copias:1})`; try/catch com `notify` do erro amigável; `imprimindo` trava o botão.
- [ ] **Step 5 (CSS `.etq-*`):** Em `global.css`: `.etq-grid` (grid 2 col, gap, `grid-template-columns: minmax(0,1fr) minmax(0,380px)` ou similar, colapsa <1024px), `.etq-modelos` (grid 2×2), `.etq-modelo` (cartão selecionável, `.is-on` realce dourado `--brand-gold`/`--app-highlight`), `.etq-previa` (moldura centralizada, fundo `--app-surface-2`, `overflow:auto`), `.etq-print-btn` (dourado). Tema-aware por tokens.
- [ ] **Step 6:** Manter `CardDispositivos` abaixo do grid. Manter `Salvar configurações` (persiste config c/ modelo/fonte + regras).
- [ ] **Step 7 (verificar):** `cd frontend && npm run build`. Conferir visual no browser (`npm run dev`).
- [ ] **Step 8:** Commit.

## Verificação final

`node src/lib/qr.test.mjs` + `node src/lib/etiquetaCanvas.test.mjs` (frontend) passam; `node --check backend/server.js`; `npm run build`; a Config abre em 2 colunas, troca de modelo muda a prévia, conectar+imprimir teste funciona com a B1 pareada.
