-- AlterTable
ALTER TABLE "Funcionario" ADD COLUMN     "biometriaEm" TIMESTAMP(3),
ADD COLUMN     "biometriaStatus" TEXT NOT NULL DEFAULT 'PENDENTE',
ADD COLUMN     "pinPonto" TEXT,
ADD COLUMN     "termoBiometriaEm" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "FuncionarioFace" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "funcionarioId" INTEGER NOT NULL,
    "descritoresJson" JSONB NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FuncionarioFace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PontoRegistro" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "funcionarioId" INTEGER NOT NULL,
    "tipo" TEXT NOT NULL,
    "dataHora" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "origem" TEXT NOT NULL DEFAULT 'FACIAL',
    "dispositivoId" INTEGER,
    "distancia" DOUBLE PRECISION,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PontoRegistro_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Dispositivo" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "nome" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "ultimaSync" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Dispositivo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FuncionarioFace_funcionarioId_key" ON "FuncionarioFace"("funcionarioId");

-- CreateIndex
CREATE INDEX "FuncionarioFace_empresaId_idx" ON "FuncionarioFace"("empresaId");

-- CreateIndex
CREATE INDEX "PontoRegistro_empresaId_dataHora_idx" ON "PontoRegistro"("empresaId", "dataHora");

-- CreateIndex
CREATE INDEX "PontoRegistro_empresaId_funcionarioId_dataHora_idx" ON "PontoRegistro"("empresaId", "funcionarioId", "dataHora");

-- CreateIndex
CREATE UNIQUE INDEX "Dispositivo_token_key" ON "Dispositivo"("token");

-- CreateIndex
CREATE INDEX "Dispositivo_empresaId_idx" ON "Dispositivo"("empresaId");
