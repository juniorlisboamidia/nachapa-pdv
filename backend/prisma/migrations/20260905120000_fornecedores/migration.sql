-- Fornecedores (Produtos › Fornecedores): cadastro de fornecedor + vínculo N:N com
-- Insumo + histórico de cotações de preço. Migra os fornecedores-texto atuais.
-- Portado do H360 (migrations 20260812120000_fornecedores + 20260812140000_fornecedor_contatos).
-- empresaId aqui NÃO leva FK para "Empresa" (mesma convenção do resto do PDV: a
-- referência é lógica, só indexada — ver comentário no topo do schema.prisma).

-- 1) Origem do custo atual do insumo (qual fornecedor forneceu o preço vigente)
ALTER TABLE "Insumo" ADD COLUMN "custoFornecedorId" INTEGER;

-- 2) Fornecedor
CREATE TABLE "Fornecedor" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "nome" TEXT NOT NULL,
    "whatsapp" TEXT,
    "telefone" TEXT,
    "email" TEXT,
    "website" TEXT,
    "endereco" TEXT,
    "observacao" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Fornecedor_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Fornecedor_empresaId_idx" ON "Fornecedor"("empresaId");
CREATE INDEX "Fornecedor_nome_idx" ON "Fornecedor"("nome");

-- 3) FornecedorInsumo (vínculo N:N + preço atual desnormalizado)
CREATE TABLE "FornecedorInsumo" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "fornecedorId" INTEGER NOT NULL,
    "insumoId" INTEGER NOT NULL,
    "precoAtual" DECIMAL(12,4),
    "precoAtualEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FornecedorInsumo_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "FornecedorInsumo_fornecedorId_insumoId_key" ON "FornecedorInsumo"("fornecedorId", "insumoId");
CREATE INDEX "FornecedorInsumo_empresaId_idx" ON "FornecedorInsumo"("empresaId");
CREATE INDEX "FornecedorInsumo_insumoId_idx" ON "FornecedorInsumo"("insumoId");
CREATE INDEX "FornecedorInsumo_fornecedorId_idx" ON "FornecedorInsumo"("fornecedorId");
ALTER TABLE "FornecedorInsumo" ADD CONSTRAINT "FornecedorInsumo_fornecedorId_fkey" FOREIGN KEY ("fornecedorId") REFERENCES "Fornecedor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FornecedorInsumo" ADD CONSTRAINT "FornecedorInsumo_insumoId_fkey" FOREIGN KEY ("insumoId") REFERENCES "Insumo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 4) FornecedorInsumoCotacao (histórico de preços)
CREATE TABLE "FornecedorInsumoCotacao" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "fornecedorInsumoId" INTEGER NOT NULL,
    "preco" DECIMAL(12,4) NOT NULL,
    "data" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "observacao" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FornecedorInsumoCotacao_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "FornecedorInsumoCotacao_empresaId_idx" ON "FornecedorInsumoCotacao"("empresaId");
CREATE INDEX "FornecedorInsumoCotacao_fornecedorInsumoId_idx" ON "FornecedorInsumoCotacao"("fornecedorInsumoId");
ALTER TABLE "FornecedorInsumoCotacao" ADD CONSTRAINT "FornecedorInsumoCotacao_fornecedorInsumoId_fkey" FOREIGN KEY ("fornecedorInsumoId") REFERENCES "FornecedorInsumo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 5) MIGRAÇÃO DOS DADOS: fornecedor-texto → entidade + vínculo + cotação inicial
-- 5a) 1 Fornecedor por nome distinto por empresa (case/espaço do texto original)
INSERT INTO "Fornecedor" ("empresaId", "nome", "ativo", "criadoEm", "atualizadoEm")
SELECT DISTINCT "empresaId", trim("fornecedor"), true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Insumo"
WHERE "fornecedor" IS NOT NULL AND trim("fornecedor") <> '';

-- 5b) Vínculo insumo↔fornecedor; preço atual = custoUnitário do insumo
INSERT INTO "FornecedorInsumo" ("empresaId", "fornecedorId", "insumoId", "precoAtual", "precoAtualEm", "criadoEm", "atualizadoEm")
SELECT i."empresaId", f."id", i."id", i."custoUnitario", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Insumo" i
JOIN "Fornecedor" f ON f."empresaId" = i."empresaId" AND f."nome" = trim(i."fornecedor")
WHERE i."fornecedor" IS NOT NULL AND trim(i."fornecedor") <> '';

-- 5c) Cotação inicial = custo atual (dá o primeiro ponto do histórico)
INSERT INTO "FornecedorInsumoCotacao" ("empresaId", "fornecedorInsumoId", "preco", "data", "criadoEm")
SELECT fi."empresaId", fi."id", fi."precoAtual", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "FornecedorInsumo" fi
WHERE fi."precoAtual" IS NOT NULL;

-- 5d) Marca a origem do custo do insumo (o fornecedor migrado; 1:1 com o vínculo)
UPDATE "Insumo" i
SET "custoFornecedorId" = fi."fornecedorId"
FROM "FornecedorInsumo" fi
WHERE fi."insumoId" = i."id";
