# Visão Geral como painel de atalhos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline, tarefa pequena) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/` do PDV mostra atalhos gerados da sidebar + faixa "Mais usados" fixada pelo usuário (localStorage por loja + usuário).
**Architecture:** lógica pura em `components/atalhos.js` (testada), ícones compartilhados em `components/sidebarIcons.jsx`, `Inicio.jsx` só compõe; 1 linha no backend (`/auth/me` do operador devolve `id`).
**Tech Stack:** React/Vite, `node --test` (frontend é ESM), Express ESM.
**Spec:** `docs/superpowers/specs/2026-09-06-visao-geral-atalhos-design.md`

## Global Constraints
- Repo `C:\Users\Windows\nachapa-pdv`; comandos da raiz. Sem dependência nova, sem migration.
- Git: `git add` explícito só dos arquivos da task; nunca `-A`; `frontend/public/favicon_novo.png` não é nosso; commit direto na `main`, push ao fim; nunca `taskkill`.
- UI: classes no `global.css` (+ `body.theme-dark`), contraste forte, laranja da marca; nada de `window.confirm`; `useEffect` sem retornar Promise.

---

### Task 1: `sidebarIcons.jsx` compartilhado
**Files:** Create `frontend/src/components/sidebarIcons.jsx`; Modify `frontend/src/components/Sidebar.jsx` (remove `ICONS`/`Icon`/`ItemIcon` inline, importa).
- [ ] Mover literalmente o bloco `const ICONS = {...}` (l.12-164), `function Icon(...)` (165-181) e `function ItemIcon(...)` (183-190) para o novo arquivo, com `export { ICONS, Icon, ItemIcon }`.
- [ ] Em `Sidebar.jsx`: `import { Icon, ItemIcon } from './sidebarIcons.jsx'`; apagar o bloco movido. `grep -c "^const ICONS" Sidebar.jsx` = 0.
- [ ] `cd frontend && npm run build` limpo. Commit: `refactor(pdv sidebar): icones SVG viram modulo compartilhado (sidebarIcons.jsx)`.

### Task 2: `atalhos.js` puro + testes (TDD)
**Files:** Create `frontend/src/components/atalhos.js`, `frontend/src/components/atalhos.test.js`.
- [ ] Testes (RED): `atalhosDaArvore` gera seções na ordem e cards de 2º nível; subgrupo aponta pra 1ª folha (Ponto Facial → `/rh/ponto-facial/painel`; Avaliador → `/avaliacoes`); grupo raiz sem `itens` não vira seção; `iconImg` preservado. `chaveFavoritos({ tipo: 'operador', id: 7 }, 3)` = `hb-favoritos:3:operador:7`; sem id → `anon`. `alternarFavorito([], '/a')` → `{ lista: ['/a'], cheio: false }`; remove se já está; 7º → `{ lista: mesma, cheio: true }`. `favoritosValidos(['/a', '/x'], atalhos)` = `['/a']`.
- [ ] Implementar; GREEN em `node --test frontend/src/components/atalhos.test.js`. Commit: `feat(pdv inicio): logica pura dos atalhos e favoritos (atalhos.js) com testes`.

### Task 3: backend — `id` do operador no `/auth/me`
**Files:** Modify `backend/server.js` (~l.233).
- [ ] `return res.json({ id: u.operadorId, nome: u.nome, papel: 'GERENTE', tipo: 'operador', podePDV: true, areas: u.areas || [] });`
- [ ] `node --check backend/server.js`. Commit: `feat(pdv auth): /auth/me do operador devolve id (favoritos por usuario)`.

### Task 4: `Inicio.jsx` + CSS `.vg-*`
**Files:** Modify `frontend/src/pages/Inicio.jsx` (reescrita), `frontend/src/styles/global.css` (append `.vg-*`).
- [ ] Inicio: `useAuth` → `gruposVisiveis(usuario)` → `atalhosDaArvore`; `DESCRICOES` (mapa `to → texto`) só nas principais; favoritos: `useState(() => ler(chave))`, `useEffect` que re-lê quando a chave muda; toggle grava (`try/catch`) e usa `alternarFavorito` (cheio → `Toast`). Faixa "Mais usados" (cards `.vg-fav`, vazio = dica) + seções. Card = `Link` com `ItemIcon`, nome, descrição, seta e botão estrela (`e.preventDefault(); e.stopPropagation()`).
- [ ] CSS: `.vg-secao`, `.vg-secao-t`, `.vg-grid`, `.vg-grid-fav`, `.vg-card`, `.vg-card:hover`, `.vg-ic`, `.vg-nome`, `.vg-desc`, `.vg-seta`, `.vg-star`, `.vg-star.on`, `.vg-fav`, `.vg-vazio` + `body.theme-dark` onde a cor não vier de token.
- [ ] `npm run build` limpo; smoke da spec §5. Commit: `feat(pdv inicio): Visao Geral vira painel de atalhos da sidebar + Mais usados fixados pelo usuario`.

### Checkpoint
`git push origin main` · deploy `cd /var/www/nachapa-pdv && bash deploy.sh` (sem migration).
