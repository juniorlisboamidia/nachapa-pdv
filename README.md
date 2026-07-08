# Operação (PDV) — `pdv.nachapahub.com.br`

Sistema de **gestão da loja**, separado do H360. **Banco próprio** (isolado — mexer aqui
não afeta o H360) e **login único** com o NaChapa HUB (SSO por cookie, **só ADMIN**).

- **Stack:** Vite + React (frontend) · Express + Prisma + Postgres (backend). Mesma do H360.
- **Multi-tenancy:** `AsyncLocalStorage` + extension do Prisma injetam `empresaId` (igual H360).
- **Auth:** valida o MESMO JWT do HUB (cookie `th_sso` / `Bearer`). Não emite token próprio.

## Estrutura
```
backend/   Express + Prisma (schema completo; banco próprio "operacao")
frontend/  Vite + React (Sidebar: Gestão + Dep. Pessoal)
backend/scripts/copiar-hamburgao.mjs   Cópia inicial dos dados do Hamburgão
deploy.sh  Deploy no VPS
```

## Rodar local
Pré-requisito: Postgres local (o mesmo do H360, em `localhost:5432`).

```bash
# 1) Banco próprio do PDV
createdb -U postgres operacao         # ou: psql -U postgres -c "CREATE DATABASE operacao;"

# 2) Backend
cd backend
cp .env.example .env                  # ajuste JWT_SECRET (== do HUB/H360)
npm install
npx prisma generate
npx prisma migrate dev --name init    # cria TODAS as tabelas no banco "operacao"

# 3) Cópia inicial do Hamburgão (H360 -> PDV). SRC_DATABASE_URL já aponta pro H360.
npm run copiar-hamburgao              # detecta a loja por nome; ou: -- <empresaId>

# 4) Sobe backend (porta 4001)
npm run dev

# 5) Frontend (outro terminal)
cd ../frontend
npm install
npm run dev
```
> Login local exige o HUB rodando (o cookie/token vem dele). Em produção, o cookie
> `th_sso` chega sozinho no subdomínio — sem tela de login.

## Deploy no VPS (`pdv.nachapahub.com.br`)
1. **DNS:** registro **A** `pdv` → mesmo IP do droplet.
2. **Banco:** `sudo -u postgres createdb operacao` (mesmo Postgres do H360/HUB).
3. **Código:** `git clone` em `/var/www/nachapa-pdv`.
4. **Env:** `backend/.env` com `DATABASE_URL` (operacao), `JWT_SECRET` **igual ao do HUB**,
   `PORT=4001`, `CORS_ORIGINS=https://pdv.nachapahub.com.br`, `SRC_DATABASE_URL` (H360).
5. **Build + migrate + PM2:** `bash deploy.sh` (roda `migrate deploy`, build e sobe `pdv-backend`).
6. **Cópia inicial:** `cd backend && npm run copiar-hamburgao` (uma vez).
7. **Nginx:** server block pra `pdv.nachapahub.com.br` servindo `frontend/dist` + proxy
   `/api` → `http://localhost:4001`; depois `certbot --nginx -d pdv.nachapahub.com.br`.
8. **HUB:** adicionar `https://pdv.nachapahub.com.br` no CORS do HUB (login/logout).

### Nginx (modelo)
```nginx
server {
  server_name pdv.nachapahub.com.br;
  root /var/www/nachapa-pdv/frontend/dist;
  index index.html;
  location /api/ { proxy_pass http://localhost:4001; proxy_set_header Host $host; proxy_set_header X-Forwarded-For $remote_addr; proxy_set_header Cookie $http_cookie; }
  location / { try_files $uri $uri/ /index.html; }
}
```

## Fases
- **F0 (atual):** esqueleto — auth ADMIN + tenant + banco próprio + tela Início. ✅
- **F1:** Dep. Pessoal (Equipe, Bonificação, Banco de Talentos).
- **F2:** Gestão (Custos, Faturamento, Ficha Técnica, Insumos) + Minha Empresa.
- **F3:** remover **só** Equipe + Bonificação do H360 (Gestão e Talentos ficam lá).
