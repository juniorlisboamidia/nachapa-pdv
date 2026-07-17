# Etiquetas — Fatia A (Modelos + Prévia na Config) — Design

**Data:** 2026-07-16 · **Projeto:** PDV / Operação (`nachapa-pdv`)

## Contexto

A tela **Etiquetas › Configuração** hoje é uma coluna estreita (identificação do
estabelecimento + regras de validade + aparelhos) e **não tem** o que a referência (Cardápio
Web) mostra: seleção de **modelo de etiqueta**, **prévia ao vivo** e **impressão de teste**.
O renderizador `etiquetaCanvas.js` desenha **um layout único hardcoded**; a impressão só
acontece no quiosque (`EtiquetasQuiosque.jsx`).

Esta fatia reforma a Config no layout 2 colunas da referência, **com as cores da marca**
(dourado sobre creme), e transforma o canvas em **4 modelos selecionáveis** com prévia e
teste de impressão. A impressão continua **Niimbot B1 Bluetooth** (Web Bluetooth) — **nada de
QZ Tray**. A Fatia B (Itens operacional: catálogo + etiqueta selecionada + fila) é separada.

## Decisões travadas (com o usuário)

1. **Impressão = Niimbot B1** (reusa `niimbotB1.conectar/conectado/imprimir(canvas,{copias})`).
   Sem QZ Tray, sem seletor de "linguagem de impressora".
2. **QR offline:** o QR **codifica os dados da etiqueta na própria imagem** (produto, validade,
   manipulação, conservação, lote, loja/CNPJ). **Sem página de rastreabilidade** e sem servidor.
   Por isso **não há** o toggle "Etiqueta / QR Code" da referência (aquele alternava para a
   página pública, que não existe aqui) — o QR é parte do modelo "Faixa lateral + QR".
3. **4 modelos** (do print): Clássico, Validade em destaque, Faixa lateral + QR, Compacto.

**Decisões técnicas assumidas:** o `modelo` e a `fonte` viram colunas em `EtiquetaConfig` (não
`campos` Json); a prévia usa o **mesmo** `desenharEtiqueta` que imprime (o que se vê é o que sai);
o gerador de QR é uma lib mínima e síncrona (`qrcode-generator`), embrulhada em `lib/qr.js`.

## Reuso (já existe e testado)

- **Canvas** `frontend/src/lib/etiquetaCanvas.js`: `desenharEtiqueta(canvas, dados, config)` +
  helpers `dimensoes(config)`, `fmt(d)`, `ajustar(ctx,texto,max)`. Gancho `qrImg` já previsto.
- **Impressora** `frontend/src/lib/niimbotB1.js`: `bluetoothDisponivel()`, `conectar()→{nome}`,
  `conectado()`, `desconectar()`, `imprimir(canvas,{copias})`. `LARGURA_PX=384` (48mm, fixo).
- **Config** `EtiquetaConfig` (schema 1721): `razaoSocial/cnpj/responsavelTecnico/sif/sie/
  larguraMm/alturaMm/campos`. `GET/PUT /api/etiquetas/config`. `EtiquetaRegra` (regras de validade).

## Modelo de dados

**`EtiquetaConfig`** ganha 2 colunas (migration `20260716360000_etiqueta_modelo`):
- `modelo String @default("CLASSICO")` — `CLASSICO | VALIDADE | LATERAL_QR | COMPACTO`.
- `fonte String @default("NORMAL")` — `NORMAL | GRANDE` (multiplicador de fonte no canvas).

`larguraMm` segue fixa em 48mm na área impressa (cabeça da B1); `alturaMm` (rolo) já é usada
pelo canvas e passa a ser **editável na UI** (presets + personalizar).

## Renderizador — `etiquetaCanvas.js` (o coração da fatia)

`desenharEtiqueta(canvas, dados, config)` deixa de ser monolítico e passa a **despachar por
`config.modelo`**, com uma função de desenho por modelo e um multiplicador de fonte por
`config.fonte` (`NORMAL`=1, `GRANDE`≈1.18). Os helpers (`fmt`, `ajustar`, `dimensoes`) ficam.
`dados` ganha `qr?: string` (texto a codificar) no lugar do `qrImg` (o canvas gera a matriz).

**Os 4 modelos** (largura sempre 384px; altura = `alturaMm*8`):
- **CLASSICO** — cabeçalho (razão social + CNPJ + selo "MANIPULADO") → **nome do produto**
  (grande) → campos em lista (MANIPULAÇÃO / VALIDADE / LOTE / RESPONSÁVEL) → **faixa preta**
  com conservação + temperatura → rodapé RDC 216/2004. (É o layout atual, reorganizado.)
- **VALIDADE** — cabeçalho enxuto (loja + selo conservação) → rótulo "VÁLIDO ATÉ" + **data/hora
  de validade em destaque** → nome do produto → linha miúda manip/lote/responsável.
- **LATERAL_QR** — **faixa preta vertical à esquerda** com a conservação (texto girado) →
  cabeçalho (loja + CNPJ) → nome → campos em **2 colunas** (validade/manipulação/responsável/
  lote) → **QR** no canto inferior direito (dados da etiqueta, offline).
- **COMPACTO** — nome do produto centralizado → MANIP e VALIDADE em **2 colunas** → faixa preta
  conservação → rodapé de 1 linha (loja · CNPJ · lote · responsável). Para etiquetas pequenas.

**QR (`lib/qr.js`, novo):** `matrizQr(texto) → boolean[][]` via `qrcode-generator` (dep nova,
mínima, síncrona, sem sub-dependências). O modelo LATERAL_QR desenha a matriz como quadrados
pretos escalados para caber no canto. Payload = texto legível (produto/validade/manipulação/
conservação/lote/loja/CNPJ) — qualquer leitor de QR lê, sem internet.

**Amostra para a prévia:** helper `dadosExemplo(config)` (no canvas ou na tela) devolve um
`dados` fictício plausível (ex.: "Molho especial da casa", conservação Resfriado, validade +5
dias) para a prévia e o teste de impressão renderizarem sem depender de item real.

## Backend

- `PUT /api/etiquetas/config` (server.js ~7119) passa a aceitar e sanear `modelo` (enum acima,
  default CLASSICO) e `fonte` (NORMAL/GRANDE). `GET` já devolve a config inteira → os campos vêm
  no `config`. Validação: valor fora da lista cai no default (não estoura).
- **Sem** rota nova de impressão nesta fatia (o teste imprime no cliente via Web Bluetooth).

## Frontend — `AbaConfig` (reforma) + CSS `.etq-*`

Layout **2 colunas** (grid; empilha no mobile), ocupando a largura da tela:

**Coluna esquerda:**
- **Impressora (Niimbot B1):** status de conexão + botão **Conectar / Reconectar**
  (`conectar()`; exige gesto do usuário; avisa se `!bluetoothDisponivel()`). Texto curto: "Conecte
  a B1 por Bluetooth para imprimir o teste e as etiquetas."
- **Identificação do estabelecimento:** razão social, CNPJ, SIF, SIE (como hoje).
- **Tamanho e fonte:** altura da etiqueta (presets 30/40/50mm + "Personalizar") e fonte
  (Normal/Grande). Largura fixa 48mm (informada, não editável).
- **Regras de validade (padrão):** mantidas (dias por conservação), como hoje.

**Coluna direita — "Modelo e prévia da etiqueta":**
- **Seletor de modelo:** 4 cartões (ícone + nome + descrição), o selecionado realçado em dourado
  → seta `config.modelo`.
- **Prévia ao vivo:** um `<canvas>` desenhado por `desenharEtiqueta(canvas, dadosExemplo, config)`,
  re-renderizado quando muda modelo/fonte/tamanho/identificação. Moldura de etiqueta em volta.
- **Imprimir etiqueta de teste:** desenha a amostra e chama `imprimir(canvas,{copias:1})`; se não
  conectado, avisa e aponta o botão Conectar (não tenta reconectar sozinho — ressalva do driver).
- Legenda com o tamanho/fonte/DPI atuais (ex.: "60×40 mm · fonte normal · 203 dpi").

**Aparelhos da cozinha** (`CardDispositivos`, já existente e já filtrando o coletor) continua,
como seção abaixo das 2 colunas — segue sendo o caminho do link do quiosque.

O **Salvar configurações** persiste config (incl. `modelo`/`fonte`) + regras (2 PUTs, como hoje).

## Erros e invariantes

- A **prévia e o teste usam o MESMO `desenharEtiqueta`** que o quiosque imprime — um só desenho,
  nunca uma reimplementação paralela (invariante já documentada no canvas).
- **Largura trava em 384px** (`LARGURA_PX`); `imprimir` já valida e estoura se divergir — os 4
  modelos DEVEM desenhar em 384px de largura.
- **Bluetooth exige gesto + contexto seguro**; `conectado()` pode "mentir" após queda → a UI só
  oferece reconectar manual, nunca reimprime sozinha.
- Valor de `modelo`/`fonte` inválido no PUT → default, sem 500.
- Não quebrar o **quiosque**: `desenharEtiqueta` muda de assinatura interna (dispatch), mas a
  chamada do quiosque (`desenharEtiqueta(canvas, {...}, config)`) continua válida — o quiosque
  passa a respeitar o `modelo`/`fonte` da config automaticamente (bônus, sem mudar a chamada).

## Testes

- `frontend/src/lib/qr.test.mjs` (node, sem framework): `matrizQr('abc')` devolve matriz quadrada
  não-vazia; texto vazio não quebra; mesma entrada → mesma matriz (determinístico).
- `etiquetaCanvas` roda no navegador (canvas); a **lógica de escala/altura** (`dimensoes`) e a
  seleção de modelo (dispatch) são verificáveis em node com um canvas stub mínimo — teste
  `etiquetaCanvas.test.mjs`: cada `modelo` chama sem lançar e seta `canvas.width===384`.
- `node --check backend/server.js`; `npm run build` do frontend.

## Fases (para o plano)

- **T1 — `lib/qr.js` + dep + teste:** `matrizQr`, `qrcode-generator` no package.json, teste node.
- **T2 — canvas nos 4 modelos:** refatorar `desenharEtiqueta` em dispatch + 4 desenhos + fonte +
  QR (LATERAL_QR) + `dadosExemplo`; teste de dispatch/dimensões com stub.
- **T3 — backend:** migration `modelo`/`fonte` em `EtiquetaConfig` + saneamento no PUT.
- **T4 — Config 2 colunas:** reforma da `AbaConfig` (Impressora/Identificação/Tamanho+Fonte/Regras
  na esquerda; seletor de modelo + prévia + teste na direita) + CSS `.etq-*` (cores da marca).

## Fora do escopo (Fatia A)

Itens operacional (catálogo + etiqueta selecionada + fila de impressão) = **Fatia B**; página de
rastreabilidade do QR (decidido: QR offline); `responsavelTecnico` no rótulo; edição de `campos`
(quais campos aparecem) — os 4 modelos definem os campos; múltiplas impressoras.
