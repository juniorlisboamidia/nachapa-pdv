# Etiquetas (rotulagem ANVISA) — Design v1

**Data:** 2026-07-15 · **Projeto:** PDV / Operação (`nachapa-pdv`)

## Contexto

A cozinha precisa rotular alimentos manipulados conforme a RDC 216/2004: ao fracionar,
abrir ou preparar um item, sai uma etiqueta com nome, data de manipulação, validade,
responsável e identificação do estabelecimento. Hoje isso é feito à mão — lento, ilegível
e sujeito a erro de cálculo de data.

O ganho não é só conformidade: a validade calculada pelo sistema elimina a conta de
cabeça, e o registro do que foi impresso permite avisar o que vence hoje antes de virar
desperdício.

**O PDV já tem quase tudo de que isso depende** — o módulo é mais integração que
construção:

| Precisa de | Já existe |
|---|---|
| Catálogo de itens | `Insumo` (+ `TipoInsumo`, `ReceitaProducao`) |
| Quem manipulou | `Funcionario` (+ presença via `PontoRegistro`) |
| Aparelho sem login na cozinha | `Dispositivo` (token de quiosque, usado no Ponto Facial) |
| Razão social / CNPJ | `Empresa` |

## Decisões travadas (com o usuário)

1. **Aparelho:** Android (celular/tablet). Web Bluetooth funciona no Chrome/Edge Android.
2. **Escopo v1:** etiquetagem + alertas de vencimento. **Sem** baixa de estoque.
3. **Catálogo:** sai dos `Insumo` do PDV, mais um campo avulso para item não cadastrado.
4. **Acesso:** quiosque por token (reusa `Dispositivo`); o funcionário toca no próprio nome.
5. **Ciclo:** a etiqueta vence sozinha e cai no histórico. Ninguém encerra manualmente.
6. **Tamanho:** rolo 50×30 mm (padrão da B1). A cabeça tem 384 px = **48 mm**, então a
   área imprimível é 48×30 mm → bitmap **384×240 px** (50 mm dariam 400 px, mas 16 px
   ficam fora da cabeça). O layout desenha para 48 mm e sobra ~1 mm de margem por lado.
7. **Impressora:** Niimbot B1, sem camada de abstração para outros modelos. Comprar uma
   (~R$200) e validar o fluxo real antes de otimizar custo de consumível — o próprio
   `EtiquetaImpressa` mede o volume, e a decisão de trocar (se vier) será com dado.

## Viabilidade da impressora (pesquisado, não presumido)

A **Niimbot B1 funciona**, com ressalvas que moldaram o design:

- **Protocolo v3**, 203 dpi, cabeça de **384 px = 48 mm físicos**. Proprietário (não fala
  TSPL/ZPL/ESC-POS), mas engenharia-reversado. `niimbot-web-bluetooth` (v1.3.5) foi
  **validada em B1 real** e é zero-dependency. Alternativa: `@mmote/niimbluelib` (MIT, mas
  em alpha — "API can change anytime").
- **Formato aceito:** bitmap **1-bit monocromático, sem dithering** (luminância < 128 =
  preto), empacotado por linha, MSB-first, com RLE por linha.
- **iOS está fora, permanentemente.** Web Bluetooth não existe no iOS — e não é limitação
  do Safari: a Apple obriga todo navegador do iOS a usar WebKit, então Chrome e Edge no
  iPhone herdam o mesmo buraco. Decidido: v1 é Android/desktop.
- **RFID obrigatório:** a B1 lê um chip criptografado no rolo e grava de volta o consumo.
  Rolo de terceiro sai ilegível. Custo de ~R$0,16–0,21/etiqueta é permanente. Aceito.
- **48 mm úteis:** os 60×40 mm da referência do usuário **não cabem**. Daí o 50×30.

### Por que a B1, sendo o consumível caro (alternativas avaliadas)

**Web Bluetooth só fala BLE/GATT — Bluetooth Classic (SPP) é inacessível pelo navegador.**
Essa restrição, não o preço, é o que decide a impressora. E a maioria das térmicas de
etiqueta usa SPP justamente porque BLE tem pouca banda para raster. A B1 é BLE — por isso
ela imprime do navegador sem app, e as "melhores no papel" não.

| | Niimbot B1 | Elgin L42DT | Knup KP-IM608 |
|---|---|---|---|
| Aparelho | ~R$200 | ~R$800–900 | ~R$543 |
| Por etiqueta | **R$0,16–0,21** (rolo travado por RFID) | R$0,026 (genérico) | R$0,026 (genérico) |
| Largura útil | 48 mm | 108 mm | 100 mm |
| Conexão | **BLE** | USB/RS-232 (sem BT) | USB + BT **de tipo não documentado** |
| Imprime do celular pelo navegador | **Sim** | Não | Provavelmente não |

- **Elgin L42DT:** eliminada — não tem Bluetooth nenhum. Exigiria PC com QZ Tray.
- **Knup KP-IM608:** tentadora (100 mm resolveria o 60×40, rolo ~7× mais barato), mas a
  Knup **não documenta o tipo de Bluetooth**; a equivalente de mercado (Xprinter XP-420B)
  pareia com **PIN 0000** — assinatura de Classic/SPP — e exige app companion. Apostar o
  projeto nisso sem a impressora na mão seria irresponsável. Não descartada: se um dia
  aparecer uma unidade, um teste de 2 minutos (página que lista dispositivos BLE) resolve.
- **Custo é real e cresce com o volume:** a ~50 etiquetas/dia, o rolo da B1 sai ~R$270/mês
  contra ~R$39 do genérico — a diferença paga uma Elgin em ~3 meses. Por isso o driver mora
  isolado em `niimbotB1.js`: trocar de modelo não deve encostar na UI.

### Riscos assumidos

- **Biblioteca não oficial:** firmware novo pode quebrá-la. Mitigação: versão exata travada
  (`-E`) e todo o protocolo isolado em um arquivo (`niimbotB1.js`), trocável sem tocar na UI.
- **Primeiro print pode desalinhar:** a B1 calibra pela altura de papel gravada no RFID.
- **Papel térmico em ambiente úmido/frio** borra e descola. É escolha de consumível, não de
  software — testar cedo com rolo real.

## Arquitetura

Sidebar do PDV ganha a categoria **Etiquetas** (Configuração · Itens · Painel · Histórico),
mais a tela de quiosque `/etiquetas/:token` (pública, fora do gate de auth).

**A impressão acontece toda no navegador.** O backend nunca fala com a impressora: ele
guarda config e registro; o Android renderiza e transmite por BLE. Consequência boa: a
prévia na tela é o **mesmo canvas** que vira bitmap — o que se vê é o que sai, não uma
aproximação em HTML.

```
[Android/Chrome]  canvas 384×240 (48×30mm @203dpi) → 1-bit → niimbot-web-bluetooth → BLE → [B1]
       │
       └── POST /api/public/etiquetas/:token/registrar → [Express] → [Postgres]
```

## Modelo de dados (4 models novos)

Padrão do PDV: `id Int @id`, `empresaId Int`, `@@index([empresaId])`, e os models entram
em `MODELS_TENANT` (`backend/server.js:23`) para a extension do Prisma injetar o tenant.
As rotas públicas (quiosque) passam `empresaId` explícito, como o Ponto Facial já faz.

### `EtiquetaConfig` (1 por empresa, `@@unique([empresaId])`)
Identificação impressa e formato: `razaoSocial`, `cnpj`, `responsavelTecnico`, `sif`, `sie`,
`larguraMm Int @default(50)`, `alturaMm Int @default(30)`, `campos Json` (quais campos
saem), `criadoEm`, `atualizadoEm`. `larguraMm` é o rolo; a área desenhada é limitada a
48 mm (384 px) pela cabeça — o canvas nunca passa disso, independente do valor.

### `EtiquetaRegra` (tabela de validade por conservação)
`conservacao ConservacaoTipo`, `tempLabel String` ("0 a 4 °C"), `dias Int`, `ordem Int`,
`ativo Boolean`. Semeada na migration com o padrão da RDC:

| Conservação | Temperatura | Dias |
|---|---|---|
| CONGELADO | ≤ -18 °C | 90 |
| RESFRIADO_0_4 | 0 a 4 °C | 5 |
| RESFRIADO_4_6 | 4 a 6 °C | 3 |
| AMBIENTE | ≤ 25 °C | 30 |
| DESCONGELADO | 0 a 4 °C | 1 |
| ABERTO | conforme fabricante | 3 |

`enum ConservacaoTipo { CONGELADO RESFRIADO_0_4 RESFRIADO_4_6 AMBIENTE DESCONGELADO ABERTO }`

### `EtiquetaItemConfig` (config de etiqueta por insumo)
`insumoId Int` (`@@unique([empresaId, insumoId])`, FK `onDelete: Cascade`),
`conservacaoPadrao ConservacaoTipo?`, `validadeDias Int?` (null = usa a `EtiquetaRegra`),
`ativo Boolean @default(true)`. É o que faz o pepino ter 3 dias e o molho 5.

### `EtiquetaImpressa` (registro — alimenta painel e histórico)
`lote String @unique` (curto, alfabeto sem ambíguos — vai no QR e na etiqueta),
`insumoId Int?` (null = avulso), `nomeItem String` (**snapshot** — renomear o insumo não
reescreve o passado), `conservacao ConservacaoTipo`, `tempLabel String`,
`manipuladoEm DateTime`, `validoAte DateTime`, `responsavelId Int?`,
`responsavelNome String` (snapshot), `dispositivoId Int?`, `quantidade Int @default(1)`,
`criadoEm`. Índices: `[empresaId, validoAte]` (painel) e `[empresaId, criadoEm]` (histórico).

Snapshot de nome e responsável é deliberado: a etiqueta é um documento sanitário do
momento da manipulação; ela não pode mudar quando o cadastro muda.

## Componentes

Cada peça com uma responsabilidade, testável isolada:

- **`backend/etiquetas.js`** — regra pura: `validadeDe(item, conservacao, regras, manipuladoEm)`
  → `{ validoAte, dias, origem }` e `gerarLote()`. Sem Prisma, sem Express. É o que carrega
  o risco de segurança alimentar, então é o que tem teste unitário.
- **`frontend/src/lib/etiquetaCanvas.js`** — `desenharEtiqueta(ctx, dados, config)`: só
  desenha. Usada pela prévia e pela impressão — a mesma função, garantindo WYSIWYG.
- **`frontend/src/lib/niimbotB1.js`** — todo o contato com a impressora: `conectar()`,
  `imprimir(canvas)`, `estado()`. Converte canvas → 1-bit → protocolo. **Único arquivo que
  sabe que a impressora é uma Niimbot** — é o que se troca se mudar de modelo.
- **Telas** — `EtiquetasConfig.jsx`, `EtiquetasItens.jsx`, `EtiquetasPainel.jsx`,
  `EtiquetasHistorico.jsx` (admin) e `EtiquetasQuiosque.jsx` (público).

## Endpoints

**Admin** (`/api/etiquetas/...`, dentro do gate, área `etiquetas` no middleware de permissão):
`GET/PUT /config` · `GET/PUT /regras` · `GET /itens` (insumos etiquetáveis + config;
exclui `EMBALAGEM`/`OPERACIONAL`) · `PUT /itens/:insumoId` · `GET /painel?dias=` ·
`GET /historico`.

**Público** (`/api/public/etiquetas/...`, resolve a loja pelo token do `Dispositivo` antes
do `tenantStore.run`, como o Ponto Facial):
`GET /:token/bootstrap` (config + regras + itens + funcionários, com quem bateu ponto hoje
primeiro) · `POST /:token/registrar` (recalcula a validade **no servidor** — o cliente não
é fonte de verdade — e grava a `EtiquetaImpressa`).

`GET /etq/:lote` — consulta pública do QR (v1: só exibe os dados da etiqueta).

## Fluxo da cozinha

1. Tablet abre `/etiquetas/:token` (sem login). Um toque conecta a B1; o navegador lembra
   o pareamento.
2. Busca o item → conservação vem preenchida da `EtiquetaItemConfig` → **a validade aparece
   calculada** na tela.
3. Toca no próprio nome (quem bateu ponto hoje vem primeiro).
4. Imprime: `POST /registrar` grava e devolve o lote; o canvas é desenhado e enviado por BLE.

## Erros

- **Sem Web Bluetooth** (iOS, navegador antigo): a tela detecta `navigator.bluetooth` no
  boot e diz o que fazer — não deixa o usuário descobrir no clique de imprimir.
- **Impressora recusa/desconecta:** o registro já está gravado; a tela oferece reimprimir
  pelo lote, sem duplicar o registro.
- **Rede cai:** sem registro, sem impressão. É o comportamento seguro: uma etiqueta que
  não existe no sistema não deveria estar colada num alimento. (Offline fica para depois,
  se a operação pedir.)

## Testes

- **Unitário** (`backend/etiquetas.test.js`): `validadeDe` — override do item vence a regra,
  regra usada quando não há override, fuso BR fixo (o VPS roda em UTC; usar
  `brFields`/`brToUtcMs`, o padrão do módulo de ponto), virada de mês.
- **Unitário**: `gerarLote` — sem caracteres ambíguos, sem colisão em N iterações.
- **Manual, cedo:** imprimir na B1 real. É o único jeito de validar bitmap, calibração e
  legibilidade — e o maior risco do projeto.

## Fases

- **F1 — Fundação:** 4 models + migration (com seed das regras) + `MODELS_TENANT` +
  `etiquetas.js` + teste + telas Configuração e Itens. Entrega o cadastro completo.
- **F2 — Impressão:** quiosque + `etiquetaCanvas.js` + `niimbotB1.js` + `/registrar`.
  Entrega o ciclo que resolve a ANVISA.
- **F3 — Vigilância:** painel de vencimentos + histórico + `/etq/:lote`.

## Fora do escopo (v1)

Baixa de estoque por QR (exige um módulo de estoque que o PDV não tem — nenhum dos 68
models atuais controla saldo, lote ou validade de insumo); iOS; impressoras não-Niimbot;
alerta ativo no WhatsApp; impressão offline.
