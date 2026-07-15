-- Bloco 3 — Indicadores coletivos configuráveis (Google/iFood/NPS) + snapshot no fechamento. Aditivo.
CREATE TABLE "BonificacaoIndicador" (
  "id"           SERIAL NOT NULL,
  "empresaId"    INTEGER NOT NULL,
  "nome"         TEXT NOT NULL,
  "escalaMax"    NUMERIC(8,2) NOT NULL DEFAULT 5,
  "peso"         NUMERIC(6,2) NOT NULL DEFAULT 1,
  "ordem"        INTEGER NOT NULL DEFAULT 0,
  "ativo"        BOOLEAN NOT NULL DEFAULT true,
  "criadoEm"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizadoEm" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BonificacaoIndicador_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "BonificacaoIndicador_empresaId_ordem_idx" ON "BonificacaoIndicador"("empresaId", "ordem");

CREATE TABLE "BonificacaoIndicadorValor" (
  "id"           SERIAL NOT NULL,
  "empresaId"    INTEGER NOT NULL,
  "indicadorId"  INTEGER NOT NULL,
  "ano"          INTEGER NOT NULL,
  "mes"          INTEGER NOT NULL,
  "valor"        NUMERIC(8,2) NOT NULL,
  "criadoEm"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizadoEm" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BonificacaoIndicadorValor_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "BonificacaoIndicadorValor_empresaId_indicadorId_ano_mes_key" ON "BonificacaoIndicadorValor"("empresaId", "indicadorId", "ano", "mes");
CREATE INDEX "BonificacaoIndicadorValor_empresaId_ano_mes_idx" ON "BonificacaoIndicadorValor"("empresaId", "ano", "mes");
ALTER TABLE "BonificacaoIndicadorValor" ADD CONSTRAINT "BonificacaoIndicadorValor_indicadorId_fkey" FOREIGN KEY ("indicadorId") REFERENCES "BonificacaoIndicador"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BonificacaoFechamento" ADD COLUMN "indicadoresJson" JSONB;
