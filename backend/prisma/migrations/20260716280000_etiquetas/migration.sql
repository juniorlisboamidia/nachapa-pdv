-- Etiquetas v1 — rotulagem ANVISA (RDC 216/2004).

CREATE TYPE "ConservacaoTipo" AS ENUM ('CONGELADO', 'RESFRIADO_0_4', 'RESFRIADO_4_6', 'AMBIENTE', 'DESCONGELADO', 'ABERTO');

CREATE TABLE "EtiquetaConfig" (
  "id"                 SERIAL PRIMARY KEY,
  "empresaId"          INTEGER NOT NULL,
  "razaoSocial"        TEXT,
  "cnpj"               TEXT,
  "responsavelTecnico" TEXT,
  "sif"                TEXT,
  "sie"                TEXT,
  "larguraMm"          INTEGER NOT NULL DEFAULT 50,
  "alturaMm"           INTEGER NOT NULL DEFAULT 30,
  "campos"             JSONB,
  "criadoEm"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizadoEm"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "EtiquetaConfig_empresaId_key" ON "EtiquetaConfig"("empresaId");
CREATE INDEX "EtiquetaConfig_empresaId_idx" ON "EtiquetaConfig"("empresaId");

CREATE TABLE "EtiquetaRegra" (
  "id"           SERIAL PRIMARY KEY,
  "empresaId"    INTEGER NOT NULL,
  "conservacao"  "ConservacaoTipo" NOT NULL,
  "tempLabel"    TEXT NOT NULL,
  "dias"         INTEGER NOT NULL,
  "ordem"        INTEGER NOT NULL DEFAULT 0,
  "ativo"        BOOLEAN NOT NULL DEFAULT true,
  "criadoEm"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "EtiquetaRegra_empresaId_conservacao_key" ON "EtiquetaRegra"("empresaId", "conservacao");
CREATE INDEX "EtiquetaRegra_empresaId_idx" ON "EtiquetaRegra"("empresaId");

CREATE TABLE "EtiquetaItemConfig" (
  "id"                SERIAL PRIMARY KEY,
  "empresaId"         INTEGER NOT NULL,
  "insumoId"          INTEGER NOT NULL,
  "conservacaoPadrao" "ConservacaoTipo",
  "validadeDias"      INTEGER,
  "ativo"             BOOLEAN NOT NULL DEFAULT true,
  "criadoEm"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizadoEm"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EtiquetaItemConfig_insumoId_fkey" FOREIGN KEY ("insumoId") REFERENCES "Insumo"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "EtiquetaItemConfig_empresaId_insumoId_key" ON "EtiquetaItemConfig"("empresaId", "insumoId");
CREATE INDEX "EtiquetaItemConfig_empresaId_idx" ON "EtiquetaItemConfig"("empresaId");

CREATE TABLE "EtiquetaImpressa" (
  "id"              SERIAL PRIMARY KEY,
  "empresaId"       INTEGER NOT NULL,
  "lote"            TEXT NOT NULL,
  "insumoId"        INTEGER,
  "nomeItem"        TEXT NOT NULL,
  "conservacao"     "ConservacaoTipo" NOT NULL,
  "tempLabel"       TEXT NOT NULL,
  "manipuladoEm"    TIMESTAMP(3) NOT NULL,
  "validoAte"       TIMESTAMP(3) NOT NULL,
  "validadeDias"    INTEGER NOT NULL,
  "responsavelId"   INTEGER,
  "responsavelNome" TEXT NOT NULL,
  "dispositivoId"   INTEGER,
  "quantidade"      INTEGER NOT NULL DEFAULT 1,
  "criadoEm"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "EtiquetaImpressa_lote_key" ON "EtiquetaImpressa"("lote");
CREATE INDEX "EtiquetaImpressa_empresaId_validoAte_idx" ON "EtiquetaImpressa"("empresaId", "validoAte");
CREATE INDEX "EtiquetaImpressa_empresaId_criadoEm_idx" ON "EtiquetaImpressa"("empresaId", "criadoEm");
CREATE INDEX "EtiquetaImpressa_empresaId_insumoId_idx" ON "EtiquetaImpressa"("empresaId", "insumoId");

-- Seed das regras padrão (RDC 216) para cada empresa existente. Sem isso a
-- primeira etiqueta não teria como calcular validade.
INSERT INTO "EtiquetaRegra" ("empresaId", "conservacao", "tempLabel", "dias", "ordem", "atualizadoEm")
SELECT e."id", r.conservacao::"ConservacaoTipo", r.temp, r.dias, r.ordem, CURRENT_TIMESTAMP
FROM "Empresa" e
CROSS JOIN (VALUES
  ('CONGELADO',     '<= -18 °C',           90, 0),
  ('RESFRIADO_0_4', '0 a 4 °C',             5, 1),
  ('RESFRIADO_4_6', '4 a 6 °C',             3, 2),
  ('AMBIENTE',      '<= 25 °C',            30, 3),
  ('DESCONGELADO',  '0 a 4 °C',             1, 4),
  ('ABERTO',        'Conforme fabricante',  3, 5)
) AS r(conservacao, temp, dias, ordem)
ON CONFLICT ("empresaId", "conservacao") DO NOTHING;
