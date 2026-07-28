-- CreateEnum
CREATE TYPE "GrupoVipCupomModo" AS ENUM ('NENHUM', 'NOVO_POR_DISPARO', 'FIXO');

-- CreateEnum
CREATE TYPE "CupomTipoCW" AS ENUM ('FREE_SHIPPING', 'PERCENT_DISCOUNT', 'FLAT_DISCOUNT');

-- CreateTable
CREATE TABLE "GrupoVipConfig" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "instanceName" TEXT,
    "instanceToken" TEXT,
    "grupoJid" TEXT,
    "grupoNome" TEXT,
    "hubClienteId" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT false,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GrupoVipConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GrupoVipMensagem" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "rotulo" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "diasSemana" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "horario" TEXT NOT NULL,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "cupomModo" "GrupoVipCupomModo" NOT NULL DEFAULT 'NENHUM',
    "cupomTipo" "CupomTipoCW",
    "cupomValor" DECIMAL(10,2),
    "cupomNome" TEXT,
    "cupomCodigoFixo" TEXT,
    "cupomValidadeHoras" INTEGER,
    "cupomPedidoMinimo" DECIMAL(10,2),
    "cupomLimiteUso" INTEGER,
    "cupomSoNovosClientes" BOOLEAN,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GrupoVipMensagem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GrupoVipDisparo" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "mensagemId" INTEGER NOT NULL,
    "dataRef" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL,
    "erro" TEXT,
    "cupomCode" TEXT,
    "conteudo" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GrupoVipDisparo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GrupoVipConfig_empresaId_key" ON "GrupoVipConfig"("empresaId");

-- CreateIndex
CREATE INDEX "GrupoVipMensagem_empresaId_idx" ON "GrupoVipMensagem"("empresaId");

-- CreateIndex
CREATE INDEX "GrupoVipDisparo_empresaId_criadoEm_idx" ON "GrupoVipDisparo"("empresaId", "criadoEm");

-- CreateIndex
CREATE UNIQUE INDEX "GrupoVipDisparo_empresaId_mensagemId_dataRef_key" ON "GrupoVipDisparo"("empresaId", "mensagemId", "dataRef");
