-- CMV Global (Estoque): contagem de estoque mensal + compras do período. Portado do H360
-- (20260722120000_cmv_global) SEM as FKs empresaId->Empresa (no PDV a referência é lógica).
-- insumoId fica solto (nullable): o item guarda snapshot de nome/custo.

CREATE TABLE "CmvContagem" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "ano" INTEGER NOT NULL,
    "mes" INTEGER NOT NULL,
    "valorTotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "observacao" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CmvContagem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CmvContagemItem" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "contagemId" INTEGER NOT NULL,
    "insumoId" INTEGER,
    "nome" TEXT NOT NULL,
    "unidade" TEXT,
    "custoUnitario" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "quantidade" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "valor" DECIMAL(12,2) NOT NULL DEFAULT 0,
    CONSTRAINT "CmvContagemItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CmvCompra" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "ano" INTEGER NOT NULL,
    "mes" INTEGER NOT NULL,
    "data" DATE NOT NULL,
    "valor" DECIMAL(12,2) NOT NULL,
    "fornecedor" TEXT,
    "observacao" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CmvCompra_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CmvCompraItem" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "compraId" INTEGER NOT NULL,
    "insumoId" INTEGER,
    "nome" TEXT NOT NULL,
    "custoUnitario" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "quantidade" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "valor" DECIMAL(12,2) NOT NULL DEFAULT 0,
    CONSTRAINT "CmvCompraItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CmvContagem_empresaId_ano_mes_key" ON "CmvContagem"("empresaId", "ano", "mes");
CREATE INDEX "CmvContagem_empresaId_ano_mes_idx" ON "CmvContagem"("empresaId", "ano", "mes");
CREATE INDEX "CmvContagemItem_empresaId_contagemId_idx" ON "CmvContagemItem"("empresaId", "contagemId");
CREATE INDEX "CmvCompra_empresaId_ano_mes_idx" ON "CmvCompra"("empresaId", "ano", "mes");
CREATE INDEX "CmvCompraItem_empresaId_compraId_idx" ON "CmvCompraItem"("empresaId", "compraId");

ALTER TABLE "CmvContagemItem" ADD CONSTRAINT "CmvContagemItem_contagemId_fkey" FOREIGN KEY ("contagemId") REFERENCES "CmvContagem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CmvCompraItem" ADD CONSTRAINT "CmvCompraItem_compraId_fkey" FOREIGN KEY ("compraId") REFERENCES "CmvCompra"("id") ON DELETE CASCADE ON UPDATE CASCADE;
