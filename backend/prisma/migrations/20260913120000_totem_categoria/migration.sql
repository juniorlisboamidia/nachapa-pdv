-- Totem: nome de exibição por CATEGORIA do Cardápio Web.
-- Só guarda exceção: categoria sem linha aqui mostra o nome do CW como ele vem.
-- `empresaId` sem FK (convenção do PDV).
CREATE TABLE "TotemCategoria" (
  "id" SERIAL NOT NULL, "empresaId" INTEGER NOT NULL, "cwCategoriaId" INTEGER NOT NULL,
  "nomeExibido" TEXT NOT NULL,
  "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "atualizadoEm" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TotemCategoria_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TotemCategoria_empresaId_cwCategoriaId_key" ON "TotemCategoria"("empresaId", "cwCategoriaId");
CREATE INDEX "TotemCategoria_empresaId_idx" ON "TotemCategoria"("empresaId");
