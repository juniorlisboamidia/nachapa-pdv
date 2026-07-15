-- Motor de Regras — M1 (fundação). Tudo aditivo; defaults preservam o comportamento atual.

-- Regra (evolução do tipo de ocorrência)
ALTER TABLE "BonificacaoTipoOcorrencia"
  ADD COLUMN "tipoImpacto"        TEXT NOT NULL DEFAULT 'PERCENTUAL',
  ADD COLUMN "evento"             TEXT,
  ADD COLUMN "severidade"         TEXT,
  ADD COLUMN "toleranciaMin"      INTEGER,
  ADD COLUMN "faixaMinMin"        INTEGER,
  ADD COLUMN "faixaMaxMin"        INTEGER,
  ADD COLUMN "reincidenciaAPartir" INTEGER,
  ADD COLUMN "incrementoPct"      NUMERIC(5,2),
  ADD COLUMN "tetoOcorrenciaPct"  NUMERIC(5,2),
  ADD COLUMN "tetoCicloPct"       NUMERIC(5,2),
  ADD COLUMN "prioridade"         INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "vigenciaInicio"     TIMESTAMP(3),
  ADD COLUMN "vigenciaFim"        TIMESTAMP(3);

-- Ocorrência (evento + impacto explicável)
ALTER TABLE "BonificacaoOcorrencia"
  ADD COLUMN "minutosEvento"  INTEGER,
  ADD COLUMN "dadosEvento"    JSONB,
  ADD COLUMN "explicacao"     TEXT,
  ADD COLUMN "severidade"     TEXT,
  ADD COLUMN "status"         TEXT NOT NULL DEFAULT 'VALIDADA',
  ADD COLUMN "lancadoPor"     INTEGER,
  ADD COLUMN "validadoPor"    INTEGER,
  ADD COLUMN "idempotencyKey" TEXT;
CREATE UNIQUE INDEX "BonificacaoOcorrencia_idempotencyKey_key" ON "BonificacaoOcorrencia"("idempotencyKey");

-- Auditoria mínima do módulo
CREATE TABLE "BonificacaoAuditoria" (
  "id"            SERIAL NOT NULL,
  "empresaId"     INTEGER NOT NULL,
  "usuarioId"     INTEGER,
  "usuarioNome"   TEXT,
  "acao"          TEXT NOT NULL,
  "entidade"      TEXT,
  "entidadeId"    INTEGER,
  "valorAntes"    JSONB,
  "valorDepois"   JSONB,
  "justificativa" TEXT,
  "criadoEm"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BonificacaoAuditoria_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "BonificacaoAuditoria_empresaId_criadoEm_idx" ON "BonificacaoAuditoria"("empresaId", "criadoEm");
