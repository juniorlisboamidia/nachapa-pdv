-- AlterTable
ALTER TABLE "Funcionario" ADD COLUMN     "jornadaId" INTEGER;

-- CreateTable
CREATE TABLE "Jornada" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "nome" TEXT NOT NULL,
    "diasJson" JSONB NOT NULL,
    "toleranciaMin" INTEGER NOT NULL DEFAULT 10,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Jornada_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Jornada_empresaId_idx" ON "Jornada"("empresaId");
