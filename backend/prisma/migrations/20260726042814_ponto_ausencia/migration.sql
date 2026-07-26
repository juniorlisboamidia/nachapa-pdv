-- CreateEnum
CREATE TYPE "AusenciaTipo" AS ENUM ('FERIAS', 'ATESTADO', 'LICENCA', 'FOLGA_ABONADA', 'OUTRO');

-- DropForeignKey
ALTER TABLE "BonificacaoIndicadorValor" DROP CONSTRAINT "BonificacaoIndicadorValor_indicadorId_fkey";

-- DropIndex
DROP INDEX "ConquistaDesbloqueada_conquistaId_funcionarioId_key";

-- CreateTable
CREATE TABLE "PontoAusencia" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "funcionarioId" INTEGER NOT NULL,
    "tipo" "AusenciaTipo" NOT NULL,
    "dataInicio" TIMESTAMP(3) NOT NULL,
    "dataFim" TIMESTAMP(3) NOT NULL,
    "observacao" TEXT,
    "trocaGrupo" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PontoAusencia_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PontoAusencia_empresaId_funcionarioId_idx" ON "PontoAusencia"("empresaId", "funcionarioId");

-- CreateIndex
CREATE INDEX "PontoAusencia_empresaId_dataInicio_dataFim_idx" ON "PontoAusencia"("empresaId", "dataInicio", "dataFim");
