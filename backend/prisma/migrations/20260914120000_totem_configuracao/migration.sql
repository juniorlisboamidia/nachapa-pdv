-- Totem: configurações do CANAL, uma linha por empresa (agregado 1:1).
-- Aditiva. Diferente de TotemApresentacao/TotemCategoria, esta linha NÃO é exceção
-- descartável: ela permanece mesmo com todos os campos no padrão — voltar a ociosidade
-- para 90 s não apaga o registro.
-- `empresaId` sem FK (convenção do PDV).
CREATE TABLE "TotemConfiguracao" (
  "id" SERIAL NOT NULL, "empresaId" INTEGER NOT NULL,
  "ociosidadeSegundos" INTEGER NOT NULL DEFAULT 90,
  "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "atualizadoEm" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TotemConfiguracao_pkey" PRIMARY KEY ("id")
);
-- Uma linha por empresa: é o que garante que o upsert do PUT não crie a segunda.
CREATE UNIQUE INDEX "TotemConfiguracao_empresaId_key" ON "TotemConfiguracao"("empresaId");
