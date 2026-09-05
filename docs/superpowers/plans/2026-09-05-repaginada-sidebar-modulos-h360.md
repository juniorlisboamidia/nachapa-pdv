# Repaginada da sidebar do PDV + importação de módulos do H360 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganizar a sidebar do PDV em 3 níveis na ordem definida pelo Junior e importar do H360 os módulos que o PDV não tem (Avaliador, Indicação, Motoboys, Estoque=CMV Global, Relatórios ligado ao HUB), em 5 fases deployáveis.

**Architecture:** O PDV é fork do H360 (mesma base React/Vite + Express ESM + Prisma multi-tenant por `AsyncLocalStorage`). Os módulos são **portados lendo o código-fonte do H360 e colando no PDV**, adaptando só as diferenças de infra documentadas (chaves de área, rotas, `MODELS_TENANT`, migrations aditivas à mão). A sidebar já sabe renderizar 3 níveis; o que muda é a árvore `grupos`, um filtro recursivo por área e o gate do backend.

**Tech Stack:** React 18 + Vite + react-router-dom · Express (ESM, `"type":"module"`) + Prisma + Postgres · `node --test` para testes puros · sem novas dependências salvo as que as páginas de Relatórios exigirem (verificado na Task 16).

**Spec:** `docs/superpowers/specs/2026-09-05-repaginada-sidebar-modulos-h360-design.md` (fonte de verdade da ordem da sidebar e das chaves de área).

## Global Constraints

- **Repos:** ALVO = `C:\Users\Windows\nachapa-pdv` (raiz do PDV; os comandos abaixo assumem `cd /c/Users/Windows/nachapa-pdv`). FONTE = `C:\Users\Windows\Hamburgueria360`. Os dois backends são **ESM** (`import`/`export`) — portar código literalmente, sem converter.
- **Fidelidade:** portar do H360 **copiando o arquivo/trecho literal** (`Read` no H360 → `Write`/`Edit` no PDV) e aplicando SÓ as adaptações listadas na task. Não reescrever, não "melhorar".
- **Migrations:** à mão, **aditivas**, nunca `prisma migrate dev` (o banco tem drift). Pastas e nomes fixos: `20260905130000_areas_marketing`, `20260905140000_motoboys_campos`, `20260905150000_cmv_global`, (`20260905160000_cardapio_faixas` só se a Task 15 precisar). Convenção do PDV: `empresaId` **sem FK** para `Empresa` (só índice).
- **Multi-tenant:** todo model novo entra no array `MODELS_TENANT` em `backend/server.js` (~l.40-65), em camelCase do client Prisma (ex.: `'cmvContagem'`).
- **Gate fail-closed:** toda rota de API nova precisa de prefixo em `AREA_PREFIXOS` (Task 1 já mapeia TODAS as rotas de todas as fases). Rotas `/api/public/*` são isentas.
- **Custo:** toda escrita em `Insumo.custoUnitario` chama `propagarCustoParaConsumidores(insumoId)` (já existe em `server.js`).
- **UI:** modais só fecham por botão; hook de confirmação existente (não `window.confirm`); nunca `Promise` retornada em `useEffect`; contraste forte; identidade **laranja** do H360 (não reintroduzir dourado `#eab802`).
- **Git:** `git add` **explícito** dos arquivos da task (nunca `-A`, `.`, `commit -a`, `reset`); o Junior trabalha em outra janela no mesmo repo; `frontend/public/favicon_novo.png` NÃO é nosso. Commit por task, mensagem terminando em `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. **Não** fazer `git push` (o controlador faz no checkpoint de cada fase). Nunca `taskkill`/`kill` de node.
- **Verificação padrão** (rodar da raiz do PDV): `node --check backend/server.js` · `cd frontend && npm run build` (o único aviso aceitável é o de chunk >500kB, pré-existente) · `node --test <arquivo>` para testes puros · `cd backend && npx prisma validate && npx prisma generate` quando o schema mudar (não toca o banco).

---

## Fase 0 — Fundação (sidebar 3 níveis + gate por item + placeholders)

### Task 1: Gate de áreas como módulo puro + migration `areas_marketing`

**Files:**
- Create: `backend/acessos/areas.js`
- Create: `backend/acessos/areas.test.js`
- Modify: `backend/server.js:198-216` (remove as consts/função inline; importa do módulo)
- Create: `backend/prisma/migrations/20260905130000_areas_marketing/migration.sql`

**Interfaces:**
- Produces: `export const AREAS_DISPONIVEIS: string[]`, `export const AREA_PREFIXOS: [string,string][]`, `export function areaDoPath(path: string): string|null` — consumidos por `server.js` (middleware de gate e `GET/POST/PUT /api/acessos`).

- [ ] **Step 1: Escrever o teste (falha porque o módulo não existe)**

Arquivo `backend/acessos/areas.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { areaDoPath, AREAS_DISPONIVEIS } from './areas.js';

test('resolve pelo prefixo mais longo: /ponto-equilibrio é gestao, não ponto', () => {
  assert.equal(areaDoPath('/ponto-equilibrio'), 'gestao');
  assert.equal(areaDoPath('/ponto/marcacoes'), 'ponto');
});

test('rotas novas de todas as fases mapeadas nas áreas certas', () => {
  assert.equal(areaDoPath('/grupo-vip/config'), 'marketing');
  assert.equal(areaDoPath('/automacoes'), 'marketing');
  assert.equal(areaDoPath('/avaliacao/campanhas'), 'marketing');
  assert.equal(areaDoPath('/indicacao/painel'), 'marketing');
  assert.equal(areaDoPath('/motoboys/config'), 'motoboys');
  assert.equal(areaDoPath('/escala-motoboys/3/dias'), 'motoboys');
  assert.equal(areaDoPath('/cmv/contagem'), 'produtos');
  assert.equal(areaDoPath('/dashboard/meta'), 'relatorios');
  assert.equal(areaDoPath('/relatorios/meta'), 'relatorios');
});

test('fail-closed: rota desconhecida e áreas extintas não resolvem', () => {
  assert.equal(areaDoPath('/financeiro'), null);
  assert.equal(areaDoPath('/nada'), null);
  assert.ok(!AREAS_DISPONIVEIS.includes('automacoes'));
  assert.ok(!AREAS_DISPONIVEIS.includes('financeiro'));
  assert.ok(AREAS_DISPONIVEIS.includes('marketing'));
  assert.ok(AREAS_DISPONIVEIS.includes('motoboys'));
});

test('prefixo não casa por substring: /pontoX não é ponto', () => {
  assert.equal(areaDoPath('/pontoX'), null);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test backend/acessos/areas.test.js`
Expected: FAIL — `Cannot find module '.../backend/acessos/areas.js'`

- [ ] **Step 3: Criar o módulo**

Arquivo `backend/acessos/areas.js`:
```js
// Permissão por área (só operadores; ADMIN vê tudo). Mapa PREFIXO de rota da API → área.
// FAIL-CLOSED: rota não mapeada = negada (o middleware em server.js trata). Resolve pelo
// prefixo MAIS LONGO que casar, pra um prefixo curto nunca engolir um mais específico.
// Chaves (fonte de verdade da sanitização em /api/acessos): ver spec §2.
export const AREAS_DISPONIVEIS = ['relatorios', 'produtos', 'gestao', 'marketing', 'ponto', 'motoboys', 'bonificacao', 'talentos', 'checklist', 'etiquetas'];

export const AREA_PREFIXOS = [
  ['/relatorios', 'relatorios'], ['/dashboard', 'relatorios'],
  ['/produtos', 'produtos'], ['/insumos', 'produtos'], ['/estoque', 'produtos'], ['/ficha-tecnica', 'produtos'], ['/fichas', 'produtos'],
  ['/fornecedores', 'produtos'], ['/fornecedor-insumo', 'produtos'], ['/cmv', 'produtos'],
  ['/custos', 'gestao'], ['/faturamento', 'gestao'], ['/ponto-equilibrio', 'gestao'],
  ['/grupo-vip', 'marketing'], ['/automacoes', 'marketing'], ['/avaliacao', 'marketing'], ['/indicacao', 'marketing'],
  ['/funcionarios', 'ponto'], ['/ponto', 'ponto'], ['/jornadas', 'ponto'], ['/funcoes', 'ponto'], ['/dispositivos', 'ponto'], ['/coletor', 'ponto'],
  ['/motoboys', 'motoboys'], ['/escala-motoboys', 'motoboys'],
  ['/bonificacao', 'bonificacao'],
  ['/candidatos', 'talentos'], ['/vagas', 'talentos'], ['/recrutamento', 'talentos'], ['/talentos', 'talentos'], ['/banco-talentos', 'talentos'],
  ['/checklist', 'checklist'], ['/etiquetas', 'etiquetas'],
];

// Mais longo primeiro (mesma ideia de acessos/modulos.js do H360).
const ORDENADOS = [...AREA_PREFIXOS].sort((a, b) => b[0].length - a[0].length);

export function areaDoPath(path) {
  for (const [pre, area] of ORDENADOS) {
    if (path === pre || path.startsWith(pre + '/')) return area;
  }
  return null;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test backend/acessos/areas.test.js`
Expected: `# pass 4` · `# fail 0`

- [ ] **Step 5: Ligar em `server.js`**

Em `backend/server.js`, junto aos outros `import` do topo (perto da l.23 `import { criarCupomCW ... }`), adicionar:
```js
import { AREAS_DISPONIVEIS, AREA_PREFIXOS, areaDoPath } from './acessos/areas.js';
```
E substituir o bloco das l.198-216 (das duas linhas de comentário `// Permissão por área ...` até o `}` de `function areaDoPath`) por:
```js
// Permissão por área (só para operadores; ADMIN vê tudo). Mapa rota→área em acessos/areas.js,
// FAIL-CLOSED: rota não mapeada = negada. Config/Acessos/WhatsApp não estão no mapa → só o dono.
const OPERADOR_LIBERADO = new Set(['/auth/me', '/lojas', '/empresa']); // meta + logo (GET); PUT /empresa exige ADMIN no handler
```
O middleware `app.use('/api', ...)` logo abaixo (l.217-226) fica **intocado** — ele já chama `areaDoPath`. Conferir com `grep -n "AREAS_DISPONIVEIS\|AREA_PREFIXOS" backend/server.js`: só devem restar o `import` e os usos em `/api/acessos` (`res.json({ operadores, areas: AREAS_DISPONIVEIS })` e os `.filter(a => AREAS_DISPONIVEIS.includes(a))`).

- [ ] **Step 6: Migration de dados**

Arquivo `backend/prisma/migrations/20260905130000_areas_marketing/migration.sql`:
```sql
-- Sidebar repaginada: a área 'automacoes' vira 'marketing' e 'financeiro' deixa de existir.
-- Sem isto os gerentes perderiam o Grupo VIP em silêncio (gate fail-closed).
UPDATE "AcessoOperador" SET "areas" = array_replace("areas", 'automacoes', 'marketing') WHERE 'automacoes' = ANY("areas");
UPDATE "AcessoOperador" SET "areas" = array_remove("areas", 'financeiro') WHERE 'financeiro' = ANY("areas");
```

- [ ] **Step 7: Verificar**

Run: `node --check backend/server.js && node --test backend/acessos/areas.test.js`
Expected: sem erro · `# pass 4`

- [ ] **Step 8: Commit**

```bash
git add backend/acessos/areas.js backend/acessos/areas.test.js backend/server.js backend/prisma/migrations/20260905130000_areas_marketing/migration.sql
git commit -m "feat(pdv acessos): gate por area vira modulo puro (prefixo mais longo) + areas marketing/motoboys

automacoes->marketing, financeiro removida, motoboys nova; prefixos de TODAS as fases ja
mapeados (fail-closed). Migration de dados renomeia a area nos acessos gravados.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Sidebar — árvore nova de 3 níveis + filtro recursivo por área (módulo puro) + `iconImg` + ícone `config`

**Files:**
- Create: `frontend/src/components/sidebarNav.js`
- Create: `frontend/src/components/sidebarNav.test.js`
- Modify: `frontend/src/components/Sidebar.jsx` (remove `grupos`/`gruposVisiveis`/`localizarRota` inline l.175-275; adiciona `config` em `ICONS`; adiciona `ItemIcon`)
- Create (cópia): `frontend/public/meta-ads.svg`, `frontend/public/instagram.svg`, `frontend/public/google-ads.svg`, `frontend/public/cardapio-web.webp` (de `Hamburgueria360/frontend/public/`)

**Interfaces:**
- Produces: `export const grupos`, `export function gruposVisiveis(usuario)`, `export function localizarRota(pathname): { grupo: string|null, sub: string|null }` — consumidos por `Sidebar.jsx`.
- Contrato dos nós: `{ label, icon?, iconImg?, to?, area?, itens? }`; nó com `itens` faz drill, nó com `to` é link; `area` em qualquer nível (filho sem `area` herda a do pai).

- [ ] **Step 1: Confirmar que o frontend é ESM para o `node --test`**

Run: `grep '"type"' frontend/package.json`
Expected: `"type": "module"`. (Se NÃO aparecer, criar os dois arquivos desta task com extensão `.mjs` em vez de `.js` e ajustar o `import` em `Sidebar.jsx` para `./sidebarNav.mjs`.)

- [ ] **Step 2: Escrever o teste (falha porque o módulo não existe)**

Arquivo `frontend/src/components/sidebarNav.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { grupos, gruposVisiveis, localizarRota } from './sidebarNav.js';

const labels = (nos) => nos.map((n) => n.label);
const grupo = (nos, label) => nos.find((n) => n.label === label);

test('ordem raiz é a definida pelo Junior', () => {
  assert.deepEqual(labels(grupos), ['Relatórios', 'Produtos', 'Gestão', 'Marketing', 'Dep. Pessoal', 'Ferramentas']);
});

test('Produtos na ordem Ficha técnica, Insumos, Estoque, Fornecedores', () => {
  assert.deepEqual(labels(grupo(grupos, 'Produtos').itens), ['Ficha técnica', 'Insumos', 'Estoque', 'Fornecedores']);
});

test('admin vê tudo', () => {
  assert.equal(gruposVisiveis({ tipo: 'admin' }), grupos);
  assert.equal(gruposVisiveis(null), grupos);
});

test('operador só com ponto vê Dep. Pessoal com Colaboradores e Ponto Facial, sem Bonificação/Motoboys/Talentos', () => {
  const v = gruposVisiveis({ tipo: 'operador', areas: ['ponto'] });
  assert.deepEqual(labels(v), ['Dep. Pessoal']);
  assert.deepEqual(labels(grupo(v, 'Dep. Pessoal').itens), ['Colaboradores', 'Ponto Facial']);
});

test('operador com marketing vê Grupo VIP, Avaliador e Indicação', () => {
  const v = gruposVisiveis({ tipo: 'operador', areas: ['marketing'] });
  assert.deepEqual(labels(v), ['Marketing']);
  assert.deepEqual(labels(grupo(v, 'Marketing').itens), ['Grupo VIP', 'Avaliador', 'Indicação']);
});

test('operador com motoboys vê só o subgrupo Motoboys dentro de Dep. Pessoal', () => {
  const v = gruposVisiveis({ tipo: 'operador', areas: ['motoboys'] });
  assert.deepEqual(labels(grupo(v, 'Dep. Pessoal').itens), ['Motoboys']);
  assert.deepEqual(labels(grupo(grupo(v, 'Dep. Pessoal').itens, 'Motoboys').itens), ['Escala', 'Entregadores', 'Calc. Frete', 'Configuração']);
});

test('operador sem nenhuma área não vê grupo algum', () => {
  assert.deepEqual(gruposVisiveis({ tipo: 'operador', areas: [] }), []);
});

test('localizarRota abre o nível certo', () => {
  assert.deepEqual(localizarRota('/rh/ponto-facial/painel'), { grupo: 'Dep. Pessoal', sub: 'Ponto Facial' });
  assert.deepEqual(localizarRota('/indicacao/promotores'), { grupo: 'Marketing', sub: 'Indicação' });
  assert.deepEqual(localizarRota('/estoque'), { grupo: 'Produtos', sub: null });
  assert.deepEqual(localizarRota('/relatorios/meta'), { grupo: 'Relatórios', sub: null });
  assert.deepEqual(localizarRota('/checklist/painel'), { grupo: 'Ferramentas', sub: 'Checklist' });
  assert.deepEqual(localizarRota('/'), { grupo: null, sub: null });
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `node --test frontend/src/components/sidebarNav.test.js`
Expected: FAIL — `Cannot find module '.../sidebarNav.js'`

- [ ] **Step 4: Criar o módulo puro com a árvore nova**

Arquivo `frontend/src/components/sidebarNav.js` (sem JSX — é importado pelo `node --test`):
```js
// Árvore da sidebar (3 níveis) + filtro por área + localização da rota. Puro, sem React,
// pra ser testado com node --test. A ORDEM aqui é a fonte de verdade (spec §1).
// Nó: { label, icon | iconImg, to?, area?, itens? }. Com `itens` = drill; com `to` = link.
// `area` pode estar em qualquer nível; filho sem `area` herda a do pai.
export const grupos = [
  {
    label: 'Relatórios', icon: 'relatorios', area: 'relatorios',
    itens: [
      { to: '/relatorios/meta', label: 'Meta Ads', iconImg: '/meta-ads.svg' },
      { to: '/relatorios/instagram', label: 'Instagram', iconImg: '/instagram.svg' },
      { to: '/relatorios/google', label: 'Google Ads', iconImg: '/google-ads.svg' },
      { to: '/relatorios/cardapio', label: 'Cardápio', iconImg: '/cardapio-web.webp' },
      { to: '/relatorios/gmn', label: 'Google Meu Negócio', icon: 'relatorios' },
    ],
  },
  {
    label: 'Produtos', icon: 'produtos', area: 'produtos',
    itens: [
      { to: '/produtos', label: 'Ficha técnica', icon: 'ficha' },
      { to: '/insumos', label: 'Insumos', icon: 'insumos' },
      { to: '/estoque', label: 'Estoque', icon: 'analise' },
      { to: '/fornecedores', label: 'Fornecedores', icon: 'empresa' },
    ],
  },
  {
    label: 'Gestão', icon: 'gestao', area: 'gestao',
    itens: [
      { to: '/faturamento', label: 'Faturamento', icon: 'faturamento' },
      { to: '/custos', label: 'Custos', icon: 'custos' },
    ],
  },
  {
    label: 'Marketing', icon: 'marketing', area: 'marketing',
    itens: [
      { to: '/marketing/grupo-vip', label: 'Grupo VIP', icon: 'marketing' },
      {
        label: 'Avaliador', icon: 'avaliacao',
        itens: [
          { to: '/avaliacoes', label: 'Avaliação', icon: 'avaliacao' },
          { to: '/clientes', label: 'Clientes', icon: 'clientes' },
          { to: '/respostas', label: 'Respostas', icon: 'relatorios' },
        ],
      },
      {
        label: 'Indicação', icon: 'marketing',
        itens: [
          { to: '/indicacao', label: 'Painel Geral', icon: 'dashboard', end: true },
          { to: '/indicacao/personalizacao', label: 'Personalização', icon: 'gestao' },
          { to: '/indicacao/promotores', label: 'Promotores', icon: 'clientes' },
          { to: '/indicacao/recompensas', label: 'Recompensas', icon: 'avaliacao' },
          { to: '/indicacao/indicacoes', label: 'Indicações', icon: 'marketing' },
          { to: '/indicacao/cupons', label: 'Cupons', icon: 'faturamento' },
        ],
      },
    ],
  },
  {
    label: 'Dep. Pessoal', icon: 'clientes',
    itens: [
      { to: '/rh/colaboradores', label: 'Colaboradores', icon: 'entregadores', area: 'ponto' },
      {
        label: 'Ponto Facial', icon: 'ponto', area: 'ponto',
        itens: [
          { to: '/rh/ponto-facial/painel', label: 'Painel', icon: 'ponto' },
          { to: '/rh/ponto-facial/jornadas', label: 'Jornadas e Escalas', icon: 'calendario' },
          { to: '/rh/ponto-facial/afastamentos', label: 'Afastamentos', icon: 'calendario' },
          { to: '/rh/ponto-facial/marcacoes', label: 'Marcações', icon: 'ponto' },
          { to: '/rh/ponto-facial/espelho', label: 'Espelho', icon: 'ficha' },
          { to: '/rh/ponto-facial/fechamento', label: 'Fechamento', icon: 'custos' },
          { to: '/rh/ponto-facial/coletor', label: 'Coletor', icon: 'ponto' },
        ],
      },
      {
        label: 'Motoboys', icon: 'moto', area: 'motoboys',
        itens: [
          { to: '/escala-motoboys', label: 'Escala', icon: 'calendario' },
          { to: '/entregadores', label: 'Entregadores', icon: 'entregadores' },
          { to: '/calc-frete', label: 'Calc. Frete', icon: 'moto' },
          { to: '/motoboys/config', label: 'Configuração', icon: 'config' },
        ],
      },
      {
        label: 'Bonificação', icon: 'faturamento', area: 'bonificacao',
        itens: [
          { to: '/rh/bonificacao/mes', label: 'Mês atual', icon: 'calendario' },
          { to: '/rh/bonificacao/equipe', label: 'Equipe & Coins', icon: 'clientes' },
          { to: '/rh/bonificacao/conquistas', label: 'Conquistas', icon: 'avaliacao' },
          { to: '/rh/bonificacao/mercado', label: 'Mercado', icon: 'produtos' },
          { to: '/rh/bonificacao/config', label: 'Configuração', icon: 'gestao' },
        ],
      },
      {
        label: 'Banco de talentos', icon: 'clientes', area: 'talentos',
        itens: [
          { to: '/rh/banco-de-talentos/banco', label: 'Cadastros', icon: 'clientes' },
          { to: '/rh/banco-de-talentos/vagas', label: 'Vagas abertas', icon: 'ficha' },
          { to: '/rh/banco-de-talentos/formulario', label: 'Formulário permanente', icon: 'ficha' },
        ],
      },
    ],
  },
  {
    label: 'Ferramentas', icon: 'gestao',
    itens: [
      {
        label: 'Checklist', icon: 'ficha', area: 'checklist',
        itens: [
          { to: '/checklist/painel', label: 'Painel', icon: 'gestao' },
          { to: '/checklist/checklists', label: 'Checklists', icon: 'ficha' },
          { to: '/checklist/templates', label: 'Templates', icon: 'produtos' },
          { to: '/checklist/notificacoes', label: 'Notificações', icon: 'marketing' },
          { to: '/checklist/configuracoes', label: 'Configurações', icon: 'gestao' },
        ],
      },
      {
        label: 'Etiquetas', icon: 'ficha', area: 'etiquetas',
        itens: [
          { to: '/etiquetas/config', label: 'Configuração', icon: 'gestao' },
          { to: '/etiquetas/itens', label: 'Itens', icon: 'ficha' },
          { to: '/etiquetas/historico', label: 'Histórico', icon: 'relatorios' },
        ],
      },
    ],
  },
];

// Filtro recursivo: nó com `area` só aparece se o operador a tiver; nó sem `area` herda a
// do pai; grupo/subgrupo só aparece se sobrar ≥1 filho. ADMIN vê tudo.
function filtrarNos(nos, areas, areaPai) {
  const out = [];
  for (const n of nos) {
    const area = n.area ?? areaPai;
    if (area && !areas.has(area)) continue;
    if (n.itens) {
      const filhos = filtrarNos(n.itens, areas, area);
      if (filhos.length) out.push({ ...n, itens: filhos });
    } else {
      out.push(n);
    }
  }
  return out;
}

export function gruposVisiveis(usuario) {
  if (!usuario || usuario.tipo !== 'operador') return grupos;
  return filtrarNos(grupos, new Set(usuario.areas || []), null);
}

// Casa a rota atual e devolve { grupo, sub } para abrir a sidebar já no nível certo.
const matchLeaf = (it, pathname) => it.to && (it.to === '/' ? pathname === '/' : pathname === it.to || pathname.startsWith(it.to + '/'));
export function localizarRota(pathname) {
  for (const g of grupos) {
    if (!g.itens) continue;
    for (const it of g.itens) {
      if (it.itens) {
        if (it.itens.some((sub) => matchLeaf(sub, pathname))) return { grupo: g.label, sub: it.label };
      } else if (matchLeaf(it, pathname)) {
        return { grupo: g.label, sub: null };
      }
    }
  }
  return { grupo: null, sub: null };
}
```
Observação: `Dep. Pessoal` e `Ferramentas` **não têm `area` própria** de propósito — cada filho carrega a sua; o grupo aparece se sobrar algum filho.

- [ ] **Step 5: Rodar e ver passar**

Run: `node --test frontend/src/components/sidebarNav.test.js`
Expected: `# pass 9` · `# fail 0`

- [ ] **Step 6: Ligar em `Sidebar.jsx`**

Em `frontend/src/components/Sidebar.jsx`:
1. Adicionar no topo: `import { gruposVisiveis, localizarRota } from './sidebarNav.js'`.
2. **Apagar** o bloco inline das l.175-275 (do comentário `// Grupos com \`itens\` fazem drill...` até o `}` de `function localizarRota`), mantendo `function itemClass` e o componente `Sidebar` intactos.
3. Em `ICONS` (l.11-156), adicionar a chave `config` (copiada do H360 `Sidebar.jsx` l.74-79):
```jsx
  config: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z" />
    </>
  ),
```
4. Logo depois de `function Icon({ name, extra })`, adicionar (copiado do H360 l.191-195):
```jsx
// Ícone de um item: imagem (logo oficial da marca) quando `iconImg`, senão o SVG monocromático.
function ItemIcon({ item }) {
  if (item.iconImg) return <img src={item.iconImg} alt="" className="sidebar-icon" style={{ objectFit: 'contain' }} />
  return <Icon name={item.icon} />
}
```
5. No render, trocar `<Icon name={item.icon} />` por `<ItemIcon item={item} />` nos **3 lugares** que renderizam itens: nível 3 (`sub.itens.map`), nível 2 folha (`NavLink` dentro de `g.itens.map`) e nível 2 subgrupo (`button.sidebar-grupo` dentro de `g.itens.map`). O `<Icon name={g.icon} />` dos grupos raiz fica como está.

- [ ] **Step 7: Copiar as imagens dos relatórios**

Copiar de `C:\Users\Windows\Hamburgueria360\frontend\public\` para `C:\Users\Windows\nachapa-pdv\frontend\public\`: `meta-ads.svg`, `instagram.svg`, `google-ads.svg`, `cardapio-web.webp`.

- [ ] **Step 8: Verificar**

Run: `node --test frontend/src/components/sidebarNav.test.js && cd frontend && npm run build && cd ..`
Expected: `# pass 9` · build sem erro.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/components/sidebarNav.js frontend/src/components/sidebarNav.test.js frontend/src/components/Sidebar.jsx frontend/public/meta-ads.svg frontend/public/instagram.svg frontend/public/google-ads.svg frontend/public/cardapio-web.webp
git commit -m "feat(pdv sidebar): arvore de 3 niveis na nova ordem + filtro recursivo por area

Visao Geral, Relatorios, Produtos, Gestao, Marketing, Dep. Pessoal, Ferramentas. Logica pura em
sidebarNav.js (testada). Operador ve so os itens das areas dele mesmo em grupo misto. iconImg
para os logos dos relatorios; icone config.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Rotas — placeholders dos módulos, redirects, remoção de `/financeiro`, rótulos de Acessos

**Files:**
- Modify: `frontend/src/App.jsx` (l.1 import; bloco de rotas l.79-121)
- Modify: `frontend/src/pages/MinhaEmpresa.jsx:11-15` (`AREA_LABEL`)

- [ ] **Step 1: Rotas**

Em `frontend/src/App.jsx`:
1. l.1: `import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'`
2. Substituir as três rotas da l.93-96 (`estoque`, `financeiro`, `relatorios`) por:
```jsx
            {/* Produtos › Estoque (vira CMV Global na Fase 3) */}
            <Route path="estoque" element={<EmConstrucao titulo="Estoque" descricao="Contagem de estoque, compras e CMV real." />} />
            {/* Relatórios (viram páginas reais na Fase 4) */}
            <Route path="relatorios" element={<Navigate to="/relatorios/meta" replace />} />
            <Route path="relatorios/meta" element={<EmConstrucao titulo="Meta Ads" descricao="Relatório de Meta Ads da loja." />} />
            <Route path="relatorios/instagram" element={<EmConstrucao titulo="Instagram" descricao="Relatório do Instagram da loja." />} />
            <Route path="relatorios/google" element={<EmConstrucao titulo="Google Ads" descricao="Relatório de Google Ads da loja." />} />
            <Route path="relatorios/cardapio" element={<EmConstrucao titulo="Cardápio" descricao="Relatório de vendas do cardápio." />} />
            <Route path="relatorios/gmn" element={<EmConstrucao titulo="Google Meu Negócio" descricao="Em breve." />} />
            {/* Marketing › Avaliador e Indicação (viram páginas reais na Fase 1) */}
            <Route path="avaliacoes" element={<EmConstrucao titulo="Avaliação" descricao="Campanhas de avaliação dos clientes." />} />
            <Route path="clientes" element={<EmConstrucao titulo="Clientes" descricao="Em breve." />} />
            <Route path="respostas" element={<EmConstrucao titulo="Respostas" descricao="Em breve." />} />
            <Route path="indicacao" element={<EmConstrucao titulo="Indicação" descricao="Programa de indicação." />} />
            <Route path="indicacao/:secao" element={<EmConstrucao titulo="Indicação" descricao="Programa de indicação." />} />
            {/* Dep. Pessoal › Motoboys (viram páginas reais na Fase 2) */}
            <Route path="escala-motoboys" element={<EmConstrucao titulo="Escala" descricao="Escala semanal dos motoboys." />} />
            <Route path="entregadores" element={<EmConstrucao titulo="Entregadores" descricao="Base de motoboys." />} />
            <Route path="calc-frete" element={<EmConstrucao titulo="Calc. Frete" descricao="Calculadora de taxa de entrega." />} />
            <Route path="motoboys/config" element={<EmConstrucao titulo="Configuração" descricao="Configuração de Motoboys." />} />
```
3. Substituir as duas rotas da l.115-116 (`automacoes` e `automacoes/grupo-vip`) por:
```jsx
            {/* Marketing › Grupo VIP (Automações virou Marketing; rota antiga redireciona) */}
            <Route path="marketing/grupo-vip" element={<GrupoVip />} />
            <Route path="automacoes/grupo-vip" element={<Navigate to="/marketing/grupo-vip" replace />} />
```

- [ ] **Step 2: Rótulos da tela Acessos**

Em `frontend/src/pages/MinhaEmpresa.jsx`, substituir o objeto `AREA_LABEL` (l.11-15) por:
```js
const AREA_LABEL = {
  relatorios: 'Relatórios', produtos: 'Produtos (ficha, insumos, estoque, fornecedores)',
  gestao: 'Gestão (faturamento, custos)', marketing: 'Marketing (Grupo VIP, Avaliador, Indicação)',
  ponto: 'Ponto Facial e Colaboradores', motoboys: 'Motoboys', bonificacao: 'Bonificação',
  talentos: 'Banco de talentos', checklist: 'Checklist', etiquetas: 'Etiquetas',
}
```

- [ ] **Step 3: Verificar**

Run: `cd frontend && npm run build && cd ..`
Expected: build sem erro. Conferir também `grep -n "financeiro" frontend/src/App.jsx frontend/src/components/sidebarNav.js` → nenhuma ocorrência.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/App.jsx frontend/src/pages/MinhaEmpresa.jsx
git commit -m "feat(pdv rotas): placeholders dos modulos novos, Grupo VIP em /marketing, sem /financeiro

Rotas de Relatorios/Avaliador/Indicacao/Motoboys em construcao (trocadas fase a fase);
/automacoes/grupo-vip redireciona; rotulos de areas na tela Acessos.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### ✅ Checkpoint Fase 0 (controlador, não subagente)
1. `git push origin main`.
2. Deploy: `cd /var/www/nachapa-pdv && bash deploy.sh` (aplica a `areas_marketing`) → Ctrl+Shift+R.
3. Smoke: como ADMIN, a sidebar mostra a ordem nova e o drill de 3 níveis (Dep. Pessoal › Ponto Facial › Painel). `/automacoes/grupo-vip` redireciona. Minha Empresa › Acessos lista as áreas novas.
4. **Teste do gate:** um operador só com `ponto` vê apenas Dep. Pessoal › Colaboradores + Ponto Facial; abrir `/api/bonificacao/...` como ele → 403. Um gerente que tinha `automacoes` continua vendo Marketing › Grupo VIP (migration de dados).

---

## Fase 1 — Avaliador + Indicação (sem migration)

### Task 4: Avaliador — backend

**Files:**
- Modify: `backend/server.js` (append dos endpoints antes de `app.get('/api/health'`… ou no fim do arquivo, antes do `app.listen`; seguir onde o PDV agrupa módulos)

**Interfaces:**
- Produces: `GET/POST /api/avaliacao/campanhas`, `PUT/DELETE /api/avaliacao/campanhas/:id`, `GET /api/avaliacao/campanhas/:id/relatorio`, `GET/POST /api/public/avaliacao/:token` — consumidos pelas páginas da Task 5.

- [ ] **Step 1: Ler a fonte**

`Read` em `C:\Users\Windows\Hamburgueria360\backend\server.js` l.7495-7640: pegar o bloco inteiro do Avaliador — o helper `metricasAvaliacao` (procurar `function metricasAvaliacao` com `grep -n`; pode estar logo antes de l.7503) e os 7 handlers (`/api/avaliacao/campanhas*` e `/api/public/avaliacao/:token`).

- [ ] **Step 2: Colar no PDV**

Colar o bloco literal em `backend/server.js` do PDV. Adaptações permitidas: nenhuma — `prisma`, `getEmpresaIdAtual()` e os models existem com os mesmos nomes. Se o bloco usar algum helper que não exista no PDV (`grep -n "function <nome>" backend/server.js` vazio), copiar o helper junto, do H360.

- [ ] **Step 3: Verificar**

Run: `node --check backend/server.js && grep -c "api/avaliacao/campanhas" backend/server.js`
Expected: sem erro · `≥ 5`

- [ ] **Step 4: Commit**

```bash
git add backend/server.js
git commit -m "feat(pdv avaliador): endpoints de campanhas e resposta publica (portados do H360)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Avaliador — frontend

**Files:**
- Create (cópia): `frontend/src/pages/Avaliacao.jsx`, `frontend/src/pages/AvaliacaoPublica.jsx` (de `Hamburgueria360/frontend/src/pages/`)
- Modify: `frontend/src/App.jsx` (imports; troca o placeholder de `avaliacoes`; rota pública)

- [ ] **Step 1: Copiar as páginas literalmente**

`Read` + `Write` dos dois arquivos. Conferir que todo `import '../components/X'` existe no PDV (`ls frontend/src/components/`); os usados por elas (`Card`, `Toast`, `ConfirmDialog`/hook de confirmação, `BotaoCopiar`) já existem.

- [ ] **Step 2: Rotas**

Em `App.jsx`: adicionar `import Avaliacao from './pages/Avaliacao'` e `import AvaliacaoPublica from './pages/AvaliacaoPublica'`; trocar a rota `avaliacoes` de `EmConstrucao` para `<Avaliacao />`; adicionar após `</Route>` (bloco público, ao lado de `talentos/:slug`):
```jsx
          <Route path="avaliacao/:token" element={<AvaliacaoPublica />} />
```
`clientes` e `respostas` continuam `EmConstrucao` (igual ao H360).

- [ ] **Step 3: CSS**

Run: `grep -c "\.aval-" frontend/src/styles/global.css`
Expected: `66` (já completo — nada a copiar). Se vier menor, copiar do `global.css` do H360 os seletores `.aval-*` que faltarem.

- [ ] **Step 4: Verificar**

Run: `cd frontend && npm run build && cd ..`
Expected: sem erro.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/Avaliacao.jsx frontend/src/pages/AvaliacaoPublica.jsx frontend/src/App.jsx
git commit -m "feat(pdv avaliador): telas Avaliacao (admin) e AvaliacaoPublica + rotas (portadas do H360)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Indicação — backend (com as constantes de ponte do HUB)

**Files:**
- Modify: `backend/server.js` (constantes `HUB_API_URL` e `svcTokenHub` junto ao `JWT_SECRET` l.102; append dos helpers e endpoints)

**Interfaces:**
- Produces: `const HUB_API_URL` e `const svcTokenHub()` no escopo do `server.js` — **reutilizados pela Task 15** (Relatórios). Endpoints `/api/public/indicacao/*` e `/api/indicacao/*` — consumidos pela Task 7.

- [ ] **Step 1: Constantes da ponte (mesmos nomes do H360, pra o código colar literal)**

Logo abaixo de `const JWT_SECRET = process.env.JWT_SECRET;` (l.102) adicionar:
```js
// API do HUB (server-to-server): o PDV lê dados que vivem no HUB assinando um JWT de
// SERVIÇO com o mesmo JWT_SECRET (compartilhado via SSO). O HUB valida só assinatura +
// claim `svc`, sem checar origem — assinamos 'h360-dashboard', o svc que todos os
// /internal/* do HUB aceitam. (A ponte de cupom do Grupo VIP em cardapioCupom.js usa o
// seu próprio 'pdv-operacao', aceito só em 2 rotas; não misturar.)
const HUB_API_URL = process.env.HUB_API_URL || 'https://nachapahub.com.br/api';
const svcTokenHub = () => jwt.sign({ svc: 'h360-dashboard' }, JWT_SECRET, { expiresIn: '30s' });
```
Conferir que `jwt` já é importado no topo (`grep -n "import jwt" backend/server.js`).

- [ ] **Step 2: Ler e colar helpers + endpoints**

`Read` em `Hamburgueria360/backend/server.js` l.7700-8260: os helpers da ponte de cupom (`criarCupomCardapioWeb`, `listarCuponsCardapioWeb`, `webhookUrlCardapioWeb`, `setStatusCupomCardapioWeb`, l.7707-7765 — **pular a linha do `svcTokenHub` de l.7705, que já foi criada no Step 1**) e TODOS os handlers de `/api/public/indicacao/*` (l.7768-7949) e `/api/indicacao/*` (l.7978-8249, incluindo `/cw-cupons` e `/cw-webhook`). Colar literal no `server.js` do PDV. Se usarem helpers ausentes no PDV (ex.: gerador de código/token), copiar junto.

- [ ] **Step 3: Verificar**

Run: `node --check backend/server.js && grep -c "api/indicacao" backend/server.js`
Expected: sem erro · `≥ 12`

- [ ] **Step 4: Commit**

```bash
git add backend/server.js
git commit -m "feat(pdv indicacao): endpoints publicos e admin + ponte de cupom CW (portados do H360)

Constantes HUB_API_URL/svcTokenHub com os mesmos nomes do H360 (tambem servem aos Relatorios).

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: Indicação — frontend

**Files:**
- Create (cópia): `frontend/src/pages/Indicacao.jsx`, `SejaPromotor.jsx`, `PainelPromotor.jsx`, `IndicacaoAtendente.jsx`, `AmigoIndicacao.jsx`
- Modify: `frontend/src/App.jsx`; possivelmente `frontend/src/styles/global.css` (bloco `confetti-`)

- [ ] **Step 1: Copiar as 5 páginas literalmente** (conferir imports de components como na Task 5).

- [ ] **Step 2: Rotas**

`App.jsx`: imports das 5; trocar `indicacao` e `indicacao/:secao` de `EmConstrucao` para `<Indicacao />`; no bloco público adicionar:
```jsx
          <Route path="indicacao/seja-promotor/:token" element={<SejaPromotor />} />
          <Route path="indicacao/painel/:token" element={<PainelPromotor />} />
          <Route path="indicacao/atendente/:token" element={<IndicacaoAtendente />} />
          <Route path="i/:codigo" element={<AmigoIndicacao />} />
```

- [ ] **Step 3: CSS**

Run: `grep -c "\.ind-" frontend/src/styles/global.css; grep -c "confetti" frontend/src/styles/global.css`
Expected: `137` e `≥ 1`. Se `confetti` der `0`, copiar do `global.css` do H360 o bloco `.confetti*` (+ seu `@keyframes`) para o fim do `global.css` do PDV.

- [ ] **Step 4: Verificar**

Run: `cd frontend && npm run build && cd ..` · Expected: sem erro.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/Indicacao.jsx frontend/src/pages/SejaPromotor.jsx frontend/src/pages/PainelPromotor.jsx frontend/src/pages/IndicacaoAtendente.jsx frontend/src/pages/AmigoIndicacao.jsx frontend/src/App.jsx frontend/src/styles/global.css
git commit -m "feat(pdv indicacao): telas admin e publicas + rotas (portadas do H360)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```
(Se o `global.css` não foi tocado, tirá-lo do `git add`.)

---

### ✅ Checkpoint Fase 1 (controlador)
1. `git push origin main` · 2. `cd /var/www/nachapa-pdv && bash deploy.sh` (sem migration) · 3. Smoke: Marketing › Avaliador › Avaliação cria campanha e o link público abre; Marketing › Indicação abre o Painel Geral; a aba Cupons CW mostra "desconectado" (esperado até a Fase 4).

---

## Fase 2 — Motoboys

### Task 8: Schema + migration `motoboys_campos`

**Files:**
- Modify: `backend/prisma/schema.prisma` (enum `MotoboyStatus`; model `Motoboy`; model `Empresa`)
- Create: `backend/prisma/migrations/20260905140000_motoboys_campos/migration.sql`

- [ ] **Step 1: Schema**

1. No `enum MotoboyStatus`, adicionar o valor:
```prisma
  PENDENTE // solicitação de cadastro via link público, aguardando aprovação da equipe
```
2. No `model Motoboy`, adicionar:
```prisma
  possuiCnh    Boolean?      // resposta "Você possui CNH?" (null = não informado). Informativo, não bloqueia.
```
3. No `model Empresa`, adicionar:
```prisma
  // ── Configuração de Motoboys (Dep. Pessoal › Motoboys › Configuração) ──
  motoboyContatoWhatsapp      String?               // nº do "Falar no WhatsApp" da escala (prioritário; vazio = cai no contato da empresa)
  motoboyBloqueadoPodeEscalar Boolean @default(false) // se um entregador BLOQUEADO pode se inscrever na escala
  motoboyPerguntaCnh          Boolean @default(false) // se o cadastro público pergunta "Você possui CNH?"
  whatsappEmpresa String?                              // número público da empresa (opcional)
  whatsappContato String?  @default("RESPONSAVEL")     // RESPONSAVEL | EMPRESA — nº usado no contato público
```

- [ ] **Step 2: Migration**

Arquivo `backend/prisma/migrations/20260905140000_motoboys_campos/migration.sql`:
```sql
-- Motoboys (portado do H360: 20260804120000_motoboy_status_pendente + 20260804160000_motoboys_config
-- + 20260804140000_empresa_whatsapp_contato). Tudo aditivo.
ALTER TYPE "MotoboyStatus" ADD VALUE IF NOT EXISTS 'PENDENTE';
ALTER TABLE "Empresa" ADD COLUMN IF NOT EXISTS "motoboyContatoWhatsapp" TEXT;
ALTER TABLE "Empresa" ADD COLUMN IF NOT EXISTS "motoboyBloqueadoPodeEscalar" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Empresa" ADD COLUMN IF NOT EXISTS "motoboyPerguntaCnh" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Motoboy" ADD COLUMN IF NOT EXISTS "possuiCnh" BOOLEAN;
ALTER TABLE "Empresa" ADD COLUMN IF NOT EXISTS "whatsappEmpresa" TEXT;
ALTER TABLE "Empresa" ADD COLUMN IF NOT EXISTS "whatsappContato" TEXT DEFAULT 'RESPONSAVEL';
```

- [ ] **Step 3: Verificar**

Run: `cd backend && npx prisma validate && npx prisma generate && cd ..`
Expected: `The schema ... is valid` · client gerado.

- [ ] **Step 4: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/20260905140000_motoboys_campos/migration.sql
git commit -m "feat(pdv motoboys): schema ganha PENDENTE, possuiCnh e config de motoboys na Empresa (migration aditiva)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: Motoboys — backend

**Files:**
- Modify: `backend/server.js` (append)

**Interfaces:**
- Produces: `/api/escala-motoboys*` (GET/POST lista, `/:id`, `/:id/dias`, `/inscricoes/:id` DELETE/confirmar/presença, `/dias/:diaId/inscricoes`), `/api/public/escala-motoboys/:token*` (GET, `/inscricao`, `/identificar`, `/cadastro`), `/api/motoboys*` (GET/POST, `/config` GET/PUT, `/:id` GET/PUT/DELETE, `/:id/historico`, `/:id/ocorrencias` GET/POST, `/ocorrencias/:id` PUT/DELETE) — consumidos pela Task 10.

- [ ] **Step 1: Ler a fonte**

`Read` em `Hamburgueria360/backend/server.js` nos blocos: escala l.6620-6800; públicos l.6840-7020; base l.7105-7410; presença: `grep -n "presenca" backend/server.js` no H360 (≈ l.7418) e ler o handler inteiro. Anotar helpers usados (geradores de token, formatadores de data, `wa.me`).

- [ ] **Step 2: Colar literal no PDV** (helpers ausentes vão junto).

- [ ] **Step 3: Verificar**

Run: `node --check backend/server.js && grep -c "api/escala-motoboys\|api/motoboys\|api/public/escala-motoboys" backend/server.js`
Expected: sem erro · `≥ 18`

- [ ] **Step 4: Commit**

```bash
git add backend/server.js
git commit -m "feat(pdv motoboys): endpoints de escala, base de motoboys, config e link publico (portados do H360)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10: Motoboys — frontend + CSS

**Files:**
- Create (cópia): `frontend/src/pages/EscalaMotoboys.jsx`, `Entregadores.jsx`, `MotoboysConfig.jsx`, `EscalaMotoboysPublica.jsx`, `CalcFrete.jsx`
- Modify: `frontend/src/App.jsx`; `frontend/src/styles/global.css` (58 seletores)

- [ ] **Step 1: Copiar as 5 páginas literalmente.** `CalcFrete.jsx` é 100% front (só `Card` e `InputMoeda`, que existem).

- [ ] **Step 2: Rotas**

`App.jsx`: imports das 5; trocar os 4 placeholders (`escala-motoboys`, `entregadores`, `calc-frete`, `motoboys/config`) pelas páginas; no bloco público adicionar:
```jsx
          <Route path="escala/motoboys/:token" element={<EscalaMotoboysPublica />} />
```

- [ ] **Step 3: CSS — copiar do `global.css` do H360 exatamente estes seletores (com suas regras completas, incluindo variantes `body.theme-dark` se houver) para o fim do `global.css` do PDV:**

`esc-` (16): `.esc-dia-bar .esc-dia-bar-fill .esc-dia-hoje .esc-dia-quando .esc-head-row .esc-link-btn .esc-link-row .esc-semana-agora .esc-semana-meta .esc-semana-mini .esc-semana-mini-fill .esc-stat .esc-stat-label .esc-stat-preench .esc-stat-valor .esc-stats`
`ent-` (28): `.ent-collapse-chevron .ent-collapse-count .ent-collapse-head .ent-hero .ent-hero-bar .ent-hero-bar-fill .ent-hero-card .ent-hero-label .ent-hero-sub .ent-hero-valor .ent-hist-filtro .ent-hist-resumo .ent-hist-wrap .ent-kpi .ent-kpi-label .ent-kpi-pend .ent-kpi-valor .ent-kpis .ent-pendente-acoes .ent-pendente-box .ent-pendente-info .ent-pendente-tag .ent-pendentes-banner .ent-pendentes-num .ent-pendentes-txt .ent-sec-head`
`pub-` (14): `.pub-aviso .pub-aviso-bloqueado .pub-aviso-btn .pub-aviso-msg .pub-aviso-novo .pub-aviso-ok .pub-aviso-pendente .pub-aviso-titulo .pub-cta .pub-dia-check .pub-dia-estado .pub-dia-quando .pub-grade-cabecalho .pub-saudacao`

Conferir depois: `for s in esc-stats ent-hero pub-cta; do grep -c "\.$s" frontend/src/styles/global.css; done` → todos `≥ 1`.

- [ ] **Step 4: Verificar**

Run: `cd frontend && npm run build && cd ..` · Expected: sem erro.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/EscalaMotoboys.jsx frontend/src/pages/Entregadores.jsx frontend/src/pages/MotoboysConfig.jsx frontend/src/pages/EscalaMotoboysPublica.jsx frontend/src/pages/CalcFrete.jsx frontend/src/App.jsx frontend/src/styles/global.css
git commit -m "feat(pdv motoboys): telas Escala, Entregadores, Calc. Frete, Configuracao e escala publica (portadas do H360)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### ✅ Checkpoint Fase 2 (controlador)
1. `git push origin main` · 2. `bash deploy.sh` (aplica `motoboys_campos`) · 3. Smoke: Dep. Pessoal › Motoboys › Entregadores cadastra um motoboy; Escala cria a semana e o link público abre sem login; Configuração salva o WhatsApp de contato.

---

## Fase 3 — Estoque = CMV Global

### Task 11: Schema (4 models) + migration `cmv_global` + `MODELS_TENANT`

**Files:**
- Modify: `backend/prisma/schema.prisma` (append dos 4 models)
- Create: `backend/prisma/migrations/20260905150000_cmv_global/migration.sql`
- Modify: `backend/server.js` (`MODELS_TENANT`)

- [ ] **Step 1: Models**

`Read` em `Hamburgueria360/backend/prisma/schema.prisma` l.1780-1850 e copiar literal os models `CmvContagem`, `CmvContagemItem`, `CmvCompra`, `CmvCompraItem` para o fim do `schema.prisma` do PDV. Eles não declaram relation com `Empresa` (só `empresaId Int` + índices) — manter assim.

- [ ] **Step 2: Migration (SQL do H360 SEM as 4 FKs para Empresa — convenção do PDV)**

Arquivo `backend/prisma/migrations/20260905150000_cmv_global/migration.sql`:
```sql
-- CMV Global (Estoque): contagem de estoque mensal + compras do período. Portado do H360
-- (20260722120000_cmv_global) SEM as FKs empresaId->Empresa (no PDV a referência é lógica).
-- insumoId fica solto (nullable): o item guarda snapshot de nome/custo.

CREATE TABLE "CmvContagem" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "ano" INTEGER NOT NULL,
    "mes" INTEGER NOT NULL,
    "valorTotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "observacao" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CmvContagem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CmvContagemItem" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "contagemId" INTEGER NOT NULL,
    "insumoId" INTEGER,
    "nome" TEXT NOT NULL,
    "unidade" TEXT,
    "custoUnitario" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "quantidade" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "valor" DECIMAL(12,2) NOT NULL DEFAULT 0,
    CONSTRAINT "CmvContagemItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CmvCompra" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "ano" INTEGER NOT NULL,
    "mes" INTEGER NOT NULL,
    "data" DATE NOT NULL,
    "valor" DECIMAL(12,2) NOT NULL,
    "fornecedor" TEXT,
    "observacao" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CmvCompra_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CmvCompraItem" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "compraId" INTEGER NOT NULL,
    "insumoId" INTEGER,
    "nome" TEXT NOT NULL,
    "custoUnitario" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "quantidade" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "valor" DECIMAL(12,2) NOT NULL DEFAULT 0,
    CONSTRAINT "CmvCompraItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CmvContagem_empresaId_ano_mes_key" ON "CmvContagem"("empresaId", "ano", "mes");
CREATE INDEX "CmvContagem_empresaId_ano_mes_idx" ON "CmvContagem"("empresaId", "ano", "mes");
CREATE INDEX "CmvContagemItem_empresaId_contagemId_idx" ON "CmvContagemItem"("empresaId", "contagemId");
CREATE INDEX "CmvCompra_empresaId_ano_mes_idx" ON "CmvCompra"("empresaId", "ano", "mes");
CREATE INDEX "CmvCompraItem_empresaId_compraId_idx" ON "CmvCompraItem"("empresaId", "compraId");

ALTER TABLE "CmvContagemItem" ADD CONSTRAINT "CmvContagemItem_contagemId_fkey" FOREIGN KEY ("contagemId") REFERENCES "CmvContagem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CmvCompraItem" ADD CONSTRAINT "CmvCompraItem_compraId_fkey" FOREIGN KEY ("compraId") REFERENCES "CmvCompra"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

- [ ] **Step 3: `MODELS_TENANT`**

Em `backend/server.js`, no array `MODELS_TENANT` (~l.40-65, onde estão `'fornecedor', 'fornecedorInsumo', ...`), adicionar:
```js
  // Produtos › Estoque (CMV Global): contagem mensal + compras
  'cmvContagem', 'cmvContagemItem', 'cmvCompra', 'cmvCompraItem',
```

- [ ] **Step 4: Verificar**

Run: `cd backend && npx prisma validate && npx prisma generate && cd .. && node --check backend/server.js`
Expected: válido · gerado · sem erro.

- [ ] **Step 5: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/20260905150000_cmv_global/migration.sql backend/server.js
git commit -m "feat(pdv estoque): models e migration do CMV Global (portados do H360) + MODELS_TENANT

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 12: CMV — backend

**Files:**
- Modify: `backend/server.js` (append)

- [ ] **Step 1: Ler a fonte**

No H360: `grep -n "app\.\(get\|post\|put\|delete\)('/api/cmv" backend/server.js` → listar TODOS os handlers (≈ l.5264, 5416, 5556, 5622, 5708) e ler cada bloco inteiro + helpers que usam.

- [ ] **Step 2: Colar literal no PDV.** Se algum handler escrever em `Insumo.custoUnitario` (`grep -n "custoUnitario" no trecho colado`), garantir que chama `propagarCustoParaConsumidores(insumoId)` logo após (mesma regra que o PDV já segue).

- [ ] **Step 3: Verificar**

Run: `node --check backend/server.js && grep -c "'/api/cmv" backend/server.js` · Expected: sem erro · `≥ 5`

- [ ] **Step 4: Commit**

```bash
git add backend/server.js
git commit -m "feat(pdv estoque): endpoints /api/cmv (contagem, compras, cmv real) portados do H360

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 13: CMV — frontend em `/estoque`

**Files:**
- Create (cópia): `frontend/src/pages/CmvGlobal.jsx`, `frontend/src/components/cmv/ContagemEstoque.jsx`, `frontend/src/components/cmv/Compras.jsx`, `frontend/src/components/relatorios/formatos.js`
- Modify: `frontend/src/App.jsx`

- [ ] **Step 1: Copiar literal** os 4 arquivos (criar as pastas `components/cmv/` e `components/relatorios/`). `CmvGlobal.jsx` importa `brl, brlExato, num` de `../components/relatorios/formatos` — por isso o `formatos.js` vem agora.

- [ ] **Step 2: Rota**

`App.jsx`: `import CmvGlobal from './pages/CmvGlobal'`; trocar a rota `estoque` de `EmConstrucao` para `<CmvGlobal />`. A sidebar já chama de "Estoque".

- [ ] **Step 3: Verificar**

Run: `cd frontend && npm run build && cd ..` · Expected: sem erro (CMV não precisa de CSS novo — usa só classes genéricas).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/CmvGlobal.jsx frontend/src/components/cmv/ContagemEstoque.jsx frontend/src/components/cmv/Compras.jsx frontend/src/components/relatorios/formatos.js frontend/src/App.jsx
git commit -m "feat(pdv estoque): CMV Global montado em /estoque (portado do H360)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### ✅ Checkpoint Fase 3 (controlador)
1. `git push origin main` · 2. `bash deploy.sh` (aplica `cmv_global`) · 3. Smoke: Produtos › Estoque abre, cria a contagem do mês a partir dos insumos e registra uma compra; o CMV real aparece.

---

## Fase 4 — Relatórios ligado ao HUB

### Task 14: Backend — proxies do HUB + `normalizar.js` (+ `cardapio-faixas`)

**Files:**
- Create (cópia): `backend/relatorios/normalizar.js` (de `Hamburgueria360/backend/relatorios/normalizar.js`)
- Modify: `backend/server.js` (append dos proxies; import do normalizar se o H360 importa)
- Possivelmente: `backend/prisma/schema.prisma` + `backend/prisma/migrations/20260905160000_cardapio_faixas/migration.sql`

**Interfaces:**
- Consumes: `HUB_API_URL`, `svcTokenHub`, `JWT_SECRET` (Task 6).
- Produces: `GET /api/dashboard/meta|google|instagram|cardapio|cardapio-fonte|cardapio-faltas-historico|anotaai|anotaai-faltas-historico`, `GET/PUT /api/dashboard/cardapio-faixas`, `GET /api/relatorios/:fonte` — consumidos pela Task 15. Todos devolvem `{ conectado: false }` sem `Empresa.clienteId`.

- [ ] **Step 1: Pré-check do HUB (fato já verificado na spec; registrar no relatório)**

O HUB (`Traffic Hub/backend/server.js`, ex. l.2702-2710 e helper `autenticarSvcH360` l.14274) valida **só** `jwt.verify(token, JWT_SECRET)` + `svc === 'h360-dashboard'`. Não checa origem. Logo `svcTokenHub()` do PDV é aceito sem mudar o HUB.

- [ ] **Step 2: `normalizar.js`** — copiar literal para `backend/relatorios/normalizar.js`. No H360, ver como é importado (`grep -n "normalizar" backend/server.js`) e replicar o `import` no PDV.

- [ ] **Step 3: Proxies** — `Read` no H360 `server.js` e colar literal no PDV:
  - `/api/dashboard/meta` l.907-937 · `/google` l.942-970 · `/instagram` l.972-1000 · `/cardapio` l.1003-1040 · `/cardapio-faixas` GET l.1041-1049 e PUT l.1051-~1080 · `/cardapio-faltas-historico` l.~1105-1130 · `/cardapio-fonte` l.~1133-1148 · `/anotaai` l.1150-1180 · `/anotaai-faltas-historico` l.1183-1200 · `/api/relatorios/:fonte` + `const REL_FONTE_ENDPOINT` l.1300-1345.
  - **Não** portar `cardapio-reativar-item`, `cardapio-resync-tempos`, `cliente-referencias`, `marcar-referencia-produzida` (as páginas de relatórios não os chamam).
  - Os handlers usam `jwt.sign({ svc: 'h360-dashboard' }, JWT_SECRET, ...)` inline e `HUB_API_URL` — os nomes já existem no PDV (Task 6); colar sem mexer.

- [ ] **Step 4: `cardapio-faixas` — persistência**

Ler o PUT (l.1051-~1080 do H360) e identificar onde grava as faixas. **Caso A** (grava numa coluna da `Empresa`): pegar o nome da coluna, achar a migration do H360 que a criou (`grep -rl "<nome>" Hamburgueria360/backend/prisma/migrations`), copiar o campo para o `model Empresa` do PDV e criar `backend/prisma/migrations/20260905160000_cardapio_faixas/migration.sql` com o mesmo `ALTER TABLE "Empresa" ADD COLUMN IF NOT EXISTS ...` da migration do H360; rodar `npx prisma validate && npx prisma generate`. **Caso B** (repassa ao HUB): nada a fazer além de colar.

- [ ] **Step 5: Verificar**

Run: `node --check backend/server.js && grep -c "'/api/dashboard/" backend/server.js` · Expected: sem erro · `≥ 9`

- [ ] **Step 6: Commit**

```bash
git add backend/relatorios/normalizar.js backend/server.js
# + backend/prisma/schema.prisma backend/prisma/migrations/20260905160000_cardapio_faixas/migration.sql se o Caso A
git commit -m "feat(pdv relatorios): proxies do HUB (meta, google, instagram, cardapio, anotaai) + normalizar (portados do H360)

O PDV assina o token de servico h360-dashboard com o JWT_SECRET compartilhado; sem clienteId => conectado:false.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 15: Relatórios — frontend

**Files:**
- Create (cópia): `frontend/src/pages/relatorios/{RelatorioBase,RelatorioShell,RelatorioMeta,RelatorioInstagram,RelatorioGoogle,RelatorioCardapioSwitch,RelatorioCardapio,RelatorioCardapioAnotaAI}.jsx`; `frontend/src/components/relatorios/{AnaliseClientes,GraficoEvolucao,HistoricoFaltas,HistoricoFaltasAnotaAI,KpiCard,SecaoGoogleAds,SecaoInstagram,SecaoMetaAds,SecaoVendasAnotaAI,SecaoVendasCardapio,SeletorPeriodo,graficos}.jsx` (o `formatos.js` já veio na Task 13)
- Modify: `frontend/src/App.jsx`; possivelmente `frontend/package.json` (dependência de gráficos)

- [ ] **Step 1: Dependências**

Run: `grep -hoE "from '(recharts|chart\.js|react-chartjs-2|apexcharts|react-apexcharts)'" /c/Users/Windows/Hamburgueria360/frontend/src/components/relatorios/*.jsx /c/Users/Windows/Hamburgueria360/frontend/src/pages/relatorios/*.jsx | sort -u`
Para cada lib listada que NÃO esteja em `frontend/package.json` do PDV: `cd frontend && npm install <lib>@<mesma versão do package.json do H360> && cd ..`.

- [ ] **Step 2: Copiar literal** os 8 + 12 arquivos (criar `pages/relatorios/`). Conferir imports de components genéricos (`Card`, `Toast`, `Skeleton`…): existem no PDV.

- [ ] **Step 3: Rotas**

`App.jsx`: imports de `RelatorioMeta`, `RelatorioInstagram`, `RelatorioGoogle`, `RelatorioCardapioSwitch` (conferir no `App.jsx` do H360 l.150-155 qual componente cada rota usa e espelhar); trocar os 4 placeholders `relatorios/meta|instagram|google|cardapio` pelos componentes; `relatorios/gmn` continua `EmConstrucao`; o `Navigate` de `/relatorios` já existe.

- [ ] **Step 4: Verificar**

Run: `cd frontend && npm run build && cd ..` · Expected: sem erro.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/relatorios frontend/src/components/relatorios frontend/src/App.jsx
# + frontend/package.json frontend/package-lock.json se instalou lib
git commit -m "feat(pdv relatorios): telas Meta, Instagram, Google e Cardapio/AnotaAI + componentes (portadas do H360)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### ✅ Checkpoint Fase 4 (controlador)
1. `git push origin main`.
2. Na VPS, antes do deploy: `cd /var/www/nachapa-pdv/backend && grep -c HUB_API_URL .env` — se `0`, o default `https://nachapahub.com.br/api` vale; confirmar também que a empresa tem o id do HUB: `psql "$DATABASE_URL" -c 'SELECT id, nome, "clienteId" FROM "Empresa";'` (o `clienteId` deve ser o id do Hamburgão no HUB).
3. `bash deploy.sh` (aplica `cardapio_faixas` se existir) → Ctrl+Shift+R.
4. Smoke: Relatórios › Meta Ads carrega KPIs (ou mostra "conecte" se o `clienteId` estiver vazio — aí é preencher o `clienteId`, não bug); Cardápio idem; Marketing › Indicação › Cupons agora mostra os cupons do CW.

---

## Self-review (feito na escrita)
- **Cobertura da spec:** §1 sidebar → Task 2; §2 gate (filtro por item, chaves, prefixos, ordem, migration, Acessos) → Tasks 1-3; §3 Fase 0 → Tasks 1-3; Fase 1 → 4-7; Fase 2 → 8-10; Fase 3 → 11-13; Fase 4 (incl. pré-check) → 14-15; §4 rotas públicas → Tasks 5, 7, 10; §5 verificação → checkpoints; §6 restrições → Global Constraints.
- **Consistência de nomes:** `areaDoPath/AREAS_DISPONIVEIS/AREA_PREFIXOS` (Task 1) usados pelo middleware existente; `gruposVisiveis/localizarRota` (Task 2) com a mesma assinatura que `Sidebar.jsx` já chama; `HUB_API_URL/svcTokenHub/JWT_SECRET` (Task 6) são os nomes literais do H360 que as Tasks 6 e 14 colam; migrations com os timestamps fixados na spec.
- **Sem placeholders:** os únicos condicionais (frontend ESM na Task 2; `confetti` na Task 7; `cardapio-faixas` na Task 14; lib de gráficos na Task 15) trazem o comando de verificação e a ação de cada ramo.
