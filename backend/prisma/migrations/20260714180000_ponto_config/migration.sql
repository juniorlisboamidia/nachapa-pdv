-- Regras de marcação do Ponto Facial (1 por loja): janela anti-duplicação + modo de batidas.
CREATE TABLE "PontoConfig" (
  "id"           SERIAL NOT NULL,
  "empresaId"    INTEGER NOT NULL,
  "dedupeMin"    INTEGER NOT NULL DEFAULT 15,
  "usaIntervalo" BOOLEAN NOT NULL DEFAULT false,
  "criadoEm"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizadoEm" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PontoConfig_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PontoConfig_empresaId_key" ON "PontoConfig"("empresaId");
