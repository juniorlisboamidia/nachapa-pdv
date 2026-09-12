-- Totem de autoatendimento: configuração explícita da apresentação (modo EXPANDIDO)
-- de um item do Cardápio Web na vitrine do totem. Só guarda exceções (voltar a NORMAL
-- apaga a linha). `empresaId` sem FK (convenção do PDV).
CREATE TABLE "TotemApresentacao" (
  "id" SERIAL NOT NULL, "empresaId" INTEGER NOT NULL, "cwItemId" INTEGER NOT NULL,
  "modo" TEXT NOT NULL, "cwGrupoPrincipalId" INTEGER NOT NULL,
  "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "atualizadoEm" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TotemApresentacao_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TotemApresentacao_empresaId_cwItemId_key" ON "TotemApresentacao"("empresaId", "cwItemId");
CREATE INDEX "TotemApresentacao_empresaId_idx" ON "TotemApresentacao"("empresaId");
