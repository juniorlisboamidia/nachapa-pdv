-- CreateTable: frases motivacionais do banner de boas-vindas (por loja)
CREATE TABLE "Frase" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "texto" TEXT NOT NULL,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Frase_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Frase_empresaId_idx" ON "Frase"("empresaId");
