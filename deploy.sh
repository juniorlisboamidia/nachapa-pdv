#!/usr/bin/env bash
# Deploy do Operação (PDV) no VPS. Rode a partir de /var/www/nachapa-pdv.
set -e

echo "==> git pull"
git pull --ff-only

echo "==> backend (deps + prisma + migrate)"
cd backend
npm install
npx prisma generate
npx prisma migrate deploy
cd ..

echo "==> frontend (build)"
cd frontend
npm install
npm run build
cd ..

echo "==> PM2 restart"
# Sobe/reinicia a partir de backend/ pra o dotenv achar o .env (cwd = backend).
pm2 restart pdv-backend --update-env || (cd backend && pm2 start server.js --name pdv-backend)
pm2 save

echo "==> OK. Ctrl+Shift+R no navegador."
