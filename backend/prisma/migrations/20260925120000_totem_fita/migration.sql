-- Totem: a FITA do produto ("Mais pedido", "Novo", "Combo"…) — apresentação deste canal,
-- uma linha por (empresa, item do Cardápio Web). Guarda o CÓDIGO do selo; o rótulo que o
-- cliente lê mora no domínio (backend/totemFita.js).
--
-- Tabela PRÓPRIA, e não coluna em TotemApresentacao: aquela tabela só existe para o modo
-- vitrine e a linha some quando o item volta a Normal — a fita não pode sumir junto.
-- Aditiva e IDEMPOTENTE: pode rodar de novo sobre um banco que já a tem.
CREATE TABLE IF NOT EXISTS "TotemFita" (
  "id"           SERIAL NOT NULL,
  "empresaId"    INTEGER NOT NULL,
  "cwItemId"     INTEGER NOT NULL,
  "selo"         TEXT NOT NULL,
  "criadoEm"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizadoEm" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TotemFita_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "TotemFita_empresaId_cwItemId_key" ON "TotemFita"("empresaId", "cwItemId");
CREATE INDEX IF NOT EXISTS "TotemFita_empresaId_idx" ON "TotemFita"("empresaId");
