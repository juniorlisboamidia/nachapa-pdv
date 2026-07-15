-- Motor de Regras — M2-M4. Faixas de minutos na regra + severidades configuráveis. Aditivo.
ALTER TABLE "BonificacaoTipoOcorrencia"
  ADD COLUMN "faixasJson"   JSONB,
  ADD COLUMN "severidadeId" INTEGER;

CREATE TABLE "BonificacaoSeveridade" (
  "id"           SERIAL NOT NULL,
  "empresaId"    INTEGER NOT NULL,
  "nome"         TEXT NOT NULL,
  "percentual"   NUMERIC(5,2) NOT NULL,
  "cor"          TEXT,
  "ordem"        INTEGER NOT NULL DEFAULT 0,
  "ativo"        BOOLEAN NOT NULL DEFAULT true,
  "criadoEm"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizadoEm" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BonificacaoSeveridade_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "BonificacaoSeveridade_empresaId_ordem_idx" ON "BonificacaoSeveridade"("empresaId", "ordem");
