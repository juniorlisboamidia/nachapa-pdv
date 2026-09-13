# Loja Digital como suíte de canais — Plano de implementação

> **Para quem for executar:** as tasks são independentes e vêm na ordem em que devem ser feitas. Cada uma termina com verificação e commit próprio. Nenhuma task altera regra de negócio validada, contrato HTTP existente, `totemCarrinho.js`, idempotência ou cotação — quem precisar disso, para e reporta.

**Objetivo:** transformar `Loja Digital` de um par de telas soltas em uma suíte de canais, com o Totem organizado em sete folhas e TV Indoor entrando como canal irmão, mais a primeira configuração real persistida do canal (tempo de ociosidade) e a separação da Tela de espera.

**Arquitetura:** nada de infraestrutura nova. `Dispositivo` continua sendo o aparelho de todos os canais (pareamento e heartbeat compartilhados); o que separa Totem de TV Indoor na interface é o `tipo`. A configuração do canal ganha um agregado próprio por empresa. O quiosque passa a ler o tempo de ociosidade do bootstrap, com a régua de validação morando só no backend.

**Stack:** Express ESM + Prisma (backend), React + Vite (frontend), `node --test` para os módulos puros.

**Data:** 2026-09-13
**Repo:** `nachapa-pdv` (PDV "Operação")
**Spec de referência:** `docs/superpowers/specs/2026-09-12-totem-redesign-ux-design.md` (rev. 4)

---

## A árvore aprovada

```
LOJA DIGITAL
├── Totem
│   ├── Pedidos                 /totem/pedidos          (existe)
│   ├── Configurações           /totem/configuracoes    (T7)
│   ├── Gestão de totens        /totem/aparelhos        (T3, reaproveita Aparelhos)
│   ├── Cardápio                /totem/cardapio         (T2, reaproveita Apresentação)
│   ├── Aparência do totem      /totem/aparencia/:aba   (T9, abas Personalização | Banners)
│   └── Formas de pagamento     /totem/pagamentos       (T1, "Em breve")
└── TV Indoor                   /tv-indoor              (T1, "Em breve")
```

## Constraints globais

Valem para **todas** as tasks; cada uma as herda sem repetir.

- **Commit por task, direto na `main`, com push.** `git add` só nos caminhos da task — nunca `-A`, nunca `commit -a`: há outras janelas abertas no mesmo repo.
- **Nenhuma regra funcional validada muda**, com uma exceção explicitamente aprovada: a participação de `inicio` no relógio de ociosidade (T10).
- **`enviando`, `travado` e as telas de resultado mantêm todas as proteções vigentes.** Nenhum relógio novo pode alcançá-los.
- **A régua de validação de configuração vive no backend.** O quiosque não reimplementa piso, teto nem arredondamento — só aplica *fallback* quando o campo não vem.
- **A Sidebar não é generalizada para N níveis.** Ela continua desenhando grupo → subgrupo → folha; profundidade extra se resolve com abas dentro da página, que é o padrão já usado em Etiquetas, Checklist, Bonificação e Ponto Facial.
- **Sem dependência de runtime do Design System do HUB.** Hoje o `totem.css` já traz os valores como literais copiados; isso continua, e o futuro `TotemDesignSystem` nasce independente. O HUB poderá ser origem opcional de "Importar identidade", nunca dependência.
- **Verificação padrão:** `node --test` nos módulos puros tocados, `node --check backend/server.js`, `npm run build` no frontend.

## Decisões fechadas (não reabrir durante a execução)

1. **Aparência do totem é folha da sidebar**, com abas internas Personalização | Banners.
2. **O prazo da confirmação ambígua sai definitivamente da ociosidade.** Continua 90 s, em constante própria, e nenhuma configuração o alcança. Ele não mede cliente parado: mede quanto tempo o totem espera antes de mandar alguém ao balcão com um pedido que talvez exista.
3. **`tela === 'espera'` passa a existir.** `espera` é o **único** estado de repouso — sem sessão e sem relógio de ociosidade. Tocar leva a `inicio`; `inicio` passa a participar do relógio; `reiniciar()` volta para `espera`. As comparações espalhadas dão lugar a um predicado explícito `emRepouso(tela)`.
4. **`TotemConfiguracao` é o agregado 1:1 de configurações do canal Totem por empresa** — não uma tabela de exceções descartáveis. Vai receber campos novos. Sem linha, GET e bootstrap aplicam os *defaults*; PUT faz *upsert*; **voltar para 90 s não apaga a linha**.
5. **A Tela de espera de T10 é funcional e independente do módulo de Banners**: identidade/logo e "TOQUE PARA COMEÇAR". Nada de carrossel. Futuramente `Aparência › Banners` alimenta essa tela sem mudar o fluxo `espera → inicio → catálogo`.

---

## Estado atual levantado (para quem executar não precisar reinvestigar)

| Peça | Onde | Observação |
|---|---|---|
| Árvore da sidebar | `frontend/src/components/sidebarNav.js` | dados + filtro recursivo por área |
| Render da sidebar | `frontend/src/components/Sidebar.jsx` | **3 níveis apenas**; `localizarRota` desce 2 |
| Rotas | `frontend/src/App.jsx` | `/totem` redireciona a `/totem/pedidos` |
| Pedidos | `frontend/src/pages/TotemPedidos.jsx` | 335 linhas |
| Apresentação | `frontend/src/pages/TotemApresentacao.jsx` | 482 linhas; embute `NomesDeCategoria.jsx` |
| Aparelhos | `frontend/src/pages/Aparelhos.jsx` | 342 linhas; PONTO/ETIQUETA já ficam de fora |
| Listagem de aparelhos | `backend/server.js` `GET /api/aparelhos` | já aceita `?tipo=` validado |
| Permissão | `backend/acessos/areas.js` | `['/totem','aparelhos']` — rota nova sob `/api/totem` já nasce protegida |
| Models do canal | `backend/prisma/schema.prisma` | `Dispositivo`, `TotemApresentacao`, `TotemCategoria`, `PedidoTotemEnvio` |
| Última migration | `20260913120000_totem_categoria` | |
| Relógio | `frontend/src/pages/TotemQuiosque.jsx` | `MS_INATIVIDADE` em **três** efeitos: reset, aviso, prazo do `travado` |

---

## Task 1 — Árvore, rotas e placeholders

**Arquivos:**
- Modificar: `frontend/src/components/sidebarNav.js`
- Modificar: `frontend/src/App.jsx`
- Modificar: `frontend/src/pages/Inicio.jsx` (texto do atalho de `/aparelhos`)
- Testes: `frontend/src/components/sidebarNav.test.js`, `frontend/src/components/atalhos.test.js`

**Interfaces produzidas:** as rotas que T2, T3, T7 e T9 vão preencher.

- [ ] **Passo 1: atualizar os testes primeiro** — a árvore nova, os ícones das sete folhas, a ordem, e `localizarRota` respondendo `{ grupo: 'Loja Digital', sub: 'Totem' }` para cada rota de `/totem/*` e `{ grupo: 'Loja Digital', sub: null }` para `/tv-indoor`. Rodar e ver falhar.

- [ ] **Passo 2: reescrever o nó `Loja Digital`** em `sidebarNav.js`. Ícones já existentes no conjunto (`sidebarIcons.jsx`), sem inventar: `relatorios`, `config`, `cpu`, `ficha`, `monitorSmartphone`/`star`, `financeiro`, `tablet`. Todas as folhas do Totem herdam `area: 'aparelhos'` do subgrupo; `TV Indoor` recebe a mesma área.

- [ ] **Passo 3: rotas em `App.jsx`**, com os redirects de compatibilidade — links antigos e favoritos não podem morrer:

```jsx
<Route path="totem" element={<Navigate to="/totem/pedidos" replace />} />
<Route path="totem/pedidos" element={<TotemPedidos />} />
<Route path="totem/configuracoes" element={<TotemConfiguracoes />} />
<Route path="totem/aparelhos" element={<Aparelhos />} />
<Route path="totem/cardapio" element={<TotemCardapio />} />
<Route path="totem/aparencia" element={<Navigate to="/totem/aparencia/personalizacao" replace />} />
<Route path="totem/aparencia/:aba" element={<TotemAparencia />} />
<Route path="totem/pagamentos" element={<EmConstrucao titulo="Formas de pagamento" descricao="Em breve." />} />
<Route path="tv-indoor" element={<EmConstrucao titulo="TV Indoor" descricao="Em breve." />} />
{/* Compatibilidade: rotas antigas continuam abrindo o lugar novo. */}
<Route path="totem/apresentacao" element={<Navigate to="/totem/cardapio" replace />} />
<Route path="aparelhos" element={<Navigate to="/totem/aparelhos" replace />} />
```

Nesta task `TotemConfiguracoes`, `TotemCardapio` e `TotemAparencia` ainda não existem: use `EmConstrucao` nas três e troque nas tasks seguintes. Um passo que não compila não é um passo.

- [ ] **Passo 4:** `npm run build`, `node --test frontend/src/components/sidebarNav.test.js frontend/src/components/atalhos.test.js`.
- [ ] **Passo 5: commit.**

---

## Task 2 — Cardápio (a Apresentação muda de casa)

**Arquivos:**
- Renomear: `frontend/src/pages/TotemApresentacao.jsx` → `frontend/src/pages/TotemCardapio.jsx` (`git mv`, para o histórico sobreviver)
- Modificar: `frontend/src/App.jsx` (usar a página real)

Sem backend, sem migration, sem mudança de regra. A tela já concentra Vitrine (`TotemApresentacao`) e nome de exibição de categoria (`TotemCategoria`); o que muda é o nome e o endereço.

- [ ] **Passo 1:** `git mv`, ajustar o componente exportado e o `<h1>` para **"Cardápio do totem"**.
- [ ] **Passo 2:** no texto de abertura, deixar dito o que a tela é: o CW continua sendo a fonte de verdade comercial (itens, preços, disponibilidade, ordem) e o PDV guarda **apenas as exceções de apresentação deste canal**. Quem abrir a tela em seis meses precisa ler isso sem perguntar.
- [ ] **Passo 3:** trocar o `EmConstrucao` da rota `totem/cardapio` pela página. Conferir que `/totem/apresentacao` redireciona.
- [ ] **Passo 4:** `npm run build`. **Passo 5: commit.**

---

## Task 3 — Gestão de totens

**Arquivos:** `frontend/src/pages/Aparelhos.jsx`, `frontend/src/App.jsx`

- [ ] **Passo 1 — PARE E VERIFIQUE A PRODUÇÃO ANTES DE QUALQUER LINHA.** Consultar se existe algum `Dispositivo` com `tipo = 'TV_INDOOR'`:

```sql
SELECT id, "empresaId", nome, "criadoEm" FROM "Dispositivo" WHERE tipo = 'TV_INDOOR';
```

**Se voltar qualquer linha, parar e reportar.** Filtrar a tela por `TOTEM` com um aparelho TV_INDOOR cadastrado o deixaria sem nenhuma interface — órfão em silêncio, que é exatamente o modo de falha que este passo existe para impedir. Só seguir com o resultado vazio, ou com uma decisão explícita sobre onde esse aparelho passa a viver.

- [ ] **Passo 2:** a página passa a pedir `GET /aparelhos?tipo=TOTEM` e o formulário de cadastro fixa `tipo: 'TOTEM'` (o seletor sai — a tela é de um canal só). Título: **"Gestão de totens"**.
- [ ] **Passo 3:** o backend **não muda**: `?tipo=` já existe e já é validado.
- [ ] **Passo 4:** `npm run build`. **Passo 5: commit.**

---

## Task 4 — Model e migration `TotemConfiguracao`

**Arquivos:** `backend/prisma/schema.prisma`, `backend/prisma/migrations/20260914120000_totem_configuracao/migration.sql`

Agregado 1:1 de configurações do canal por empresa. **Não** é tabela de exceções: a linha nasce no primeiro salvamento e permanece, mesmo que todos os campos voltem ao padrão. Vai receber campos novos — orientação da tela, posição das categorias, logo própria — e é por isso que ela é um agregado e não uma coluna solta em outro lugar.

- [ ] **Passo 1: model.**

```prisma
// Configurações do canal TOTEM, uma linha por empresa. Agregado 1:1, e não
// tabela de exceções: a linha permanece mesmo com todos os campos no padrão —
// voltar a ociosidade para 90 s NÃO apaga o registro. Campos novos (orientação,
// posição das categorias, logo do canal) entram aqui.
//
// Sem linha, o servidor responde os defaults. Quem valida é
// `backend/totemConfiguracao.js`, e a régua vive só lá.
model TotemConfiguracao {
  id                 Int      @id @default(autoincrement())
  empresaId          Int      @unique
  ociosidadeSegundos Int      @default(90)
  criadoEm           DateTime @default(now())
  atualizadoEm       DateTime @updatedAt
}
```

- [ ] **Passo 2: migration à mão, só-aditiva** (`CREATE TABLE` + `CREATE UNIQUE INDEX`). Nada de `migrate dev`.
- [ ] **Passo 3:** `npx prisma generate` e `node --check backend/server.js`.
- [ ] **Passo 4: commit.** 🔴 Este deploy exige `prisma migrate deploy` — o `deploy.sh` do PDV já roda.

---

## Task 5 — Régua pura `backend/totemConfiguracao.js`

**Arquivos:** criar `backend/totemConfiguracao.js` e `backend/totemConfiguracao.test.js`

Puro pelo mesmo motivo de `totemCategoria.js`: o PUT do admin e o bootstrap público precisam ler a **mesma** régua. Duas cópias divergem no dia em que alguém mexe numa só.

- [ ] **Passo 1: testes primeiro.** Padrão quando não há linha; valores válidos passando intactos; abaixo do piso e acima do teto sendo grampeados; `null`, `undefined`, `'abc'`, `NaN`, `12.7` e negativo caindo no padrão ou no piso, nunca derrubando; e o `paraJson` devolvendo sempre um número.

- [ ] **Passo 2: implementação.**

```js
export const OCIOSIDADE_PADRAO = 90;
export const OCIOSIDADE_MIN = 30;   // abaixo disto o cliente é expulso lendo o cardápio
export const OCIOSIDADE_MAX = 600;  // acima disto um carrinho abandonado prende o totem
export const OCIOSIDADE_SUGERIDA = Object.freeze([30, 45, 60, 90, 120, 180, 300]);

export function normalizarOciosidade(valor) { /* inteiro, grampeado, padrão na dúvida */ }
export function configuracaoParaJson(linha) { /* { ociosidadeSegundos } sempre válido */ }
```

O teto é maior que a maior sugestão de propósito: a lista da interface é conselho, o limite é segurança.

- [ ] **Passo 3:** `node --test backend/totemConfiguracao.test.js`. **Passo 4: commit.**

---

## Task 6 — Endpoints e entrega no bootstrap

**Arquivos:** `backend/server.js`

- [ ] **Passo 1:** `GET /api/totem/configuracao` — sem linha, responde os defaults (não cria nada).
- [ ] **Passo 2:** `PUT /api/totem/configuracao` — **upsert**, valor passando por `normalizarOciosidade` antes de gravar. Escopado por empresa, atrás do gate de admin. Nada a fazer em `areas.js`: o prefixo `/totem` já mapeia para a área `aparelhos`.
- [ ] **Passo 3:** o bootstrap público (`GET /api/public/aparelho/totem/bootstrap`) passa a devolver `configuracao: { ociosidadeSegundos }`, sempre normalizado. Uma leitura a mais, em paralelo com as que já existem em `comApresentacao`.
- [ ] **Passo 4:** `node --check backend/server.js` e um bootstrap real contra produção (leitura, sem cotar e sem pedir). **Passo 5: commit.**

---

## Task 7 — Tela Configurações

**Arquivos:** criar `frontend/src/pages/TotemConfiguracoes.jsx`; modificar `frontend/src/App.jsx`

- [ ] **Passo 1:** carregar por `useEffect(() => { carregar() }, [])` — nunca `Promise` direto no efeito, e sem `setState` síncrono no corpo.
- [ ] **Passo 2:** seletor com os sete valores sugeridos, o padrão indicado, e uma frase dizendo o que o número significa: **é o tempo total até o reset**, e o aviso "Ainda está aí?" aparece nos 15 s finais. Sem isso alguém vai configurar 30 s achando que é o tempo até o aviso.
- [ ] **Passo 3:** salvar com retorno visível de sucesso e de erro. Nada de `window.confirm`/`alert`.
- [ ] **Passo 4:** `npm run build`. **Passo 5: commit.**

---

## Task 8 — O quiosque passa a obedecer à configuração

**Arquivos:** `frontend/src/pages/TotemQuiosque.jsx`

- [ ] **Passo 1: separar o prazo do `travado` primeiro, em commit mentalmente isolado do resto.** Hoje ele reusa `MS_INATIVIDADE`; passa a ter constante própria:

```js
// Prazo da confirmação em DÚVIDA. Não é ociosidade e NÃO segue a configuração
// da loja: não mede cliente parado, mede quanto tempo o totem espera antes de
// mandar alguém ao balcão com um pedido que talvez exista. Baixar isto para 30 s
// despacharia o cliente antes de a confirmação chegar.
const MS_AMBIGUO = 90_000
```

- [ ] **Passo 2:** o tempo de ociosidade passa a vir do boot, com *fallback* seguro. O frontend **não** reimplementa a régua — o backend já entrega normalizado; aqui só se protege da ausência do campo (servidor antigo, bootstrap de cache):

```js
const msOciosidade = Number.isFinite(Number(boot?.configuracao?.ociosidadeSegundos))
  ? Number(boot.configuracao.ociosidadeSegundos) * 1000
  : MS_INATIVIDADE_PADRAO   // 90_000
```

- [ ] **Passo 3:** os dois relógios (reset e aviso) passam a usar esse valor. **Um único valor derivado, lido pelos dois** — nada de segunda fonte de verdade e nada de um terceiro `setTimeout`. O aviso continua sendo `total − 15 s`; com o mínimo de 30 s isso deixa 15 s de leitura antes do aviso, que é o motivo de o piso ser 30.
- [ ] **Passo 4:** conferir que `enviando` e `travado` continuam impedindo o armar dos dois relógios, e que `resultado` continua fora do aviso.
- [ ] **Passo 5:** `npm run build`. **Passo 6: commit.**

---

## Task 9 — Aparência do totem (casca)

**Arquivos:** criar `frontend/src/pages/TotemAparencia.jsx`; modificar `frontend/src/App.jsx`

Estrutura, sem persistência. Abas por rota (`/totem/aparencia/:aba`), como Etiquetas e Checklist já fazem.

- [ ] **Passo 1: aba Personalização** com os quatro campos desenhados e **desabilitados**, cada um com o rótulo definitivo: orientação (vertical / horizontal), posição das categorias (esquerda / direita / topo), logo própria do totem, Design System próprio do totem.
- [ ] **Passo 2: aba Banners** — casca com uma frase do que virá. Nenhum módulo funcional.
- [ ] **Passo 3:** deixar escrito, em comentário no topo do arquivo, que o `TotemDesignSystem` nasce **independente** do HUB, e que a independência já é fato hoje: o `totem.css` copiou os valores da marca como literais e não consome nada do HUB em runtime. O HUB poderá ser origem opcional de "Importar identidade" — nunca dependência.
- [ ] **Passo 4:** `npm run build`. **Passo 5: commit.**

---

## Task 10 — Tela de espera

**Arquivos:** criar `frontend/src/components/totem/TelaEspera.jsx`; modificar `frontend/src/pages/TotemQuiosque.jsx`, `frontend/src/styles/totem.css`

A única task que muda comportamento validado, e por isso é a última. Hoje `TelaInicio` acumula dois papéis: o repouso que fica horas no vidro e a escolha Comer aqui / Levar. `tela === 'inicio'` é justamente o que **desliga** os relógios — separar os papéis exige mover essa proteção junto.

- [ ] **Passo 1: o predicado, antes de tudo.** Um lugar só decide o que é repouso:

```js
// Repouso = sem sessão e sem relógio. É SÓ a espera: `inicio` já é escolha
// começada, e um cliente que toca, vê as duas opções e vai embora precisa que
// o totem volte sozinho ao vidro.
const emRepouso = (tela) => tela === 'espera'
```

Trocar as quatro comparações `tela === 'inicio'` espalhadas pelo predicado. Depois desta troca, `inicio` **participa** do relógio de ociosidade — é a mudança de comportamento aprovada.

- [ ] **Passo 2: `TelaEspera.jsx`** — funcional e independente do futuro módulo de Banners: identidade/logo da loja e **"TOQUE PARA COMEÇAR"**. Sem carrossel, sem vídeo, sem rotação. A tela inteira é o alvo de toque, com alvo real e não só um botão pequeno.
- [ ] **Passo 3:** `reiniciar()` passa a apontar para `'espera'`. Conferir cada saída que hoje leva a `inicio`, inclusive a guarda de loja fechada e a de `orderTypes` vazio — loja fechada continua tendo tela própria e **não** pode cair na espera prometendo pedido.
- [ ] **Passo 4:** o toque na espera leva a `inicio`. `TelaInicio` perde o papel de repouso e passa a ser só a escolha do modo — o texto dela pode encolher, mas **isso não é rodada de arte**: mudança visual além do necessário fica para depois.
- [ ] **Passo 5: conferir as proteções uma a uma.** `enviando` e `travado` seguem bloqueando os dois relógios; `resultado` segue fora do aviso; o prazo do `travado` segue em `MS_AMBIGUO` e não foi alcançado por nada disto.
- [ ] **Passo 6:** `npm run build` e a suíte pura completa. **Passo 7: commit.**

---

## Testes

| O quê | Onde | Task |
|---|---|---|
| Árvore, ícones, ordem, `localizarRota` | `frontend/src/components/sidebarNav.test.js` | T1 |
| Atalhos da Visão Geral | `frontend/src/components/atalhos.test.js` | T1 |
| Régua da ociosidade (padrão, piso, teto, lixo) | `backend/totemConfiguracao.test.js` (novo) | T5 |
| Suíte pura existente sem regressão (145 hoje) | `totemCarrinho`, `totemLayout`, `totemFoco`, `totemCategoria` | T8, T10 |

Não há teste automatizado do relógio nem da máquina de telas — o quiosque é orquestrador, e a cobertura dele é o checkpoint no aparelho. T8 e T10 entram no checkpoint com itens próprios: ociosidade configurada valendo de fato, aviso nos 15 s finais, e a espera recebendo o reset.

## Fora de escopo desta frente

- Módulo funcional de Banners.
- TV Indoor além do placeholder — sem banco, sem endpoints, sem tela.
- Formas de pagamento além do "Em breve".
- Persistência de qualquer campo de Aparência.
- `TotemDesignSystem` como model.
- Generalizar a Sidebar para N níveis.
