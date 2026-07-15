-- Bloco 5 — Mercado folga (data desejada) + snapshot de regras no fechamento. Aditivo.
ALTER TABLE "MercadoItem" ADD COLUMN "tipo" TEXT NOT NULL DEFAULT 'PRODUTO';
ALTER TABLE "MercadoResgate"
  ADD COLUMN "tipoItem"     TEXT NOT NULL DEFAULT 'PRODUTO',
  ADD COLUMN "dataDesejada" TIMESTAMP(3);
ALTER TABLE "BonificacaoFechamento" ADD COLUMN "regrasJson" JSONB;
