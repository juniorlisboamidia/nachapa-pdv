# Visão Geral do PDV como painel de atalhos — Design

**Data:** 2026-09-06 · **Status:** aprovado pelo Junior · **Repo:** `nachapa-pdv` (frontend React/Vite; 1 linha no backend)

## Objetivo
A tela inicial (`/`, `pages/Inicio.jsx`) vira um painel de atalhos das ferramentas, sempre em sincronia com a sidebar, com uma faixa "Mais usados" que o próprio usuário fixa.

## Decisões (com o Junior)
- **Escopo:** TUDO da sidebar, gerado automaticamente + faixa "Mais usados" no topo.
- **Favoritos:** definidos pelo próprio usuário (estrela nos cards), guardados **no navegador por loja + usuário** (`localStorage`, mesmo padrão de `hb-theme`/`hb-sidebar-collapsed`). Migrar pro backend depois não muda a tela.

## 1. Fonte dos atalhos
- `atalhosDaArvore(grupos)` lê a árvore de `components/sidebarNav.js` já filtrada por `gruposVisiveis(usuario)` (operador vê só as áreas dele; ADMIN vê tudo).
- Uma **seção por grupo raiz** que tenha `itens`, na ordem da sidebar (Relatórios, Produtos, Gestão, Marketing, Dep. Pessoal, Ferramentas). Grupo raiz sem `itens` (link direto) não vira seção.
- Um **card por nó de 2º nível**: folha → `to`; subgrupo → `to` da **primeira folha** dele (busca em profundidade; ex.: Ponto Facial → `/rh/ponto-facial/painel`, Avaliador → `/avaliacoes`).
- Card carrega `label`, `icon`/`iconImg` (os mesmos da sidebar) e `descricao` opcional vinda de um mapa `DESCRICOES[to]` em `Inicio.jsx` (só nas principais; sem entrada → só o nome).
- "Visão Geral" não vira card (é a própria tela).

## 2. "Mais usados" (favoritos)
- Cada card tem um botão **estrela** (`aria-label` "Fixar em Mais usados" / "Desafixar"); fixado = estrela cheia laranja.
- Faixa "Mais usados" no topo (abaixo do hero), cards maiores (`.vg-fav`), na ordem em que foram fixados; a estrela na faixa desafixa.
- **Limite 6.** Ao tentar fixar o 7º: toast "Máximo de 6 em Mais usados — desafixe um primeiro." (usa o `Toast` do app).
- Vazio: card-dica "Fixe suas ferramentas mais usadas pela estrela dos cards."
- Persistência: chave `hb-favoritos:<lojaId>:<tipo>:<id>` → JSON array de rotas `to`. `chaveFavoritos(usuario, lojaId)`: `tipo` = `usuario.tipo` (`admin`/`operador`), `id` = `usuario.id` ou `anon`. Leitura/escrita em `try/catch` (localStorage pode falhar); valor inválido = `[]`.
- Rotas fixadas que não existem mais na árvore visível são **ignoradas na exibição** (`favoritosValidos`), sem apagar do storage (o operador pode recuperar a área).
- Backend (1 linha): `GET /api/auth/me` do **operador** passa a devolver `id: u.operadorId` (hoje não devolve `id`; o ADMIN já devolve `id: membroId`). Sem isso dois gerentes no mesmo PC dividiriam favoritos.

## 3. Visual
- Mantém o hero (Olá + loja) e o aviso "sem loja" como hoje.
- Seções com título em caixa alta (`.vg-secao-t`), grade `repeat(auto-fill, minmax(240px, 1fr))` (`.vg-grid`); favoritos `minmax(280px, 1fr)` com card maior (`.vg-fav`).
- Card (`.vg-card`): fundo `--app-surface`, borda `--app-border`, hover borda `--brand-gold` (laranja) + sombra laranja suave, seta `→` desliza no hover (como hoje). Ícone SVG monocromático via `ItemIcon` (logo quando `iconImg`) num quadrado `--app-highlight`.
- Estrela (`.vg-star`): canto superior direito, 32×32 (área de toque confortável), sem roubar o clique do card (`preventDefault` + `stopPropagation`).
- Tudo por classes no `global.css` (com variante `body.theme-dark` onde a cor não vier de token); nada de inline novo; contraste forte; cores só as de marca já existentes.

## 4. Arquitetura
- `frontend/src/components/sidebarIcons.jsx` — `ICONS`, `Icon`, `ItemIcon` saem de `Sidebar.jsx` (que passa a importar daqui) e ficam compartilhados com `Inicio.jsx`.
- `frontend/src/components/atalhos.js` — puro, testável (`node --test`): `atalhosDaArvore(grupos)`, `primeiraFolha(no)`, `chaveFavoritos(usuario, lojaId)`, `alternarFavorito(lista, to, max = 6)` → `{ lista, cheio }`, `favoritosValidos(lista, atalhos)`.
- `frontend/src/pages/Inicio.jsx` — só composição: `useAuth` → `gruposVisiveis` → `atalhosDaArvore`; estado de favoritos lido do `localStorage` na montagem (por chave) e gravado a cada toggle.

## 5. Verificação
- `node --test frontend/src/components/atalhos.test.js` (e `sidebarNav.test.js` continua passando); `cd frontend && npm run build`; `node --check backend/server.js`.
- Smoke: operador só-`ponto` vê só a seção Dep. Pessoal com Colaboradores + Ponto Facial; fixar 2, recarregar → continuam; fixar o 7º → toast; trocar de usuário no mesmo PC → favoritos diferentes.

## 6. Restrições
- Sem dependência nova, sem migration. Git: `git add` explícito; commit direto na `main`; push ao fim. Nunca `taskkill`. Identidade laranja.
