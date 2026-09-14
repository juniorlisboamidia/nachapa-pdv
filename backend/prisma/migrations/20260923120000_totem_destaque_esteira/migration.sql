-- Totem: as linhas da esteira passam a dizer em QUAL esteira estão — 'SUPERIOR' (anda para a
-- direita) ou 'INFERIOR' (para a esquerda). Dez em cada, sem se misturar.
--
-- Aditiva e IDEMPOTENTE: tudo `IF NOT EXISTS`, porque uma migration desta tabela já falhou
-- no meio em produção e deixou estado parcial. O que existir cai na SUPERIOR pelo DEFAULT,
-- que é onde aquelas linhas sempre estiveram (havia uma esteira só). Sem conversão de dado.
ALTER TABLE "TotemDestaque" ADD COLUMN IF NOT EXISTS "esteira" TEXT NOT NULL DEFAULT 'SUPERIOR';
DROP INDEX IF EXISTS "TotemDestaque_empresaId_ordem_idx";
CREATE INDEX IF NOT EXISTS "TotemDestaque_empresaId_esteira_ordem_idx" ON "TotemDestaque"("empresaId", "esteira", "ordem");
