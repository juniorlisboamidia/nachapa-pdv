-- Bloco 4 — Ouvidoria/Sugestões + Contribuições positivas + Reconhecimento entre colegas. Aditivo.
ALTER TABLE "BonificacaoConfig"
  ADD COLUMN "reconhecimentoCoins"  INTEGER NOT NULL DEFAULT 10,
  ADD COLUMN "reconhecimentoMaxMes" INTEGER NOT NULL DEFAULT 3;

CREATE TABLE "BonificacaoOuvidoria" (
  "id"            SERIAL NOT NULL,
  "empresaId"     INTEGER NOT NULL,
  "funcionarioId" INTEGER,
  "anonimo"       BOOLEAN NOT NULL DEFAULT false,
  "tipo"          TEXT NOT NULL DEFAULT 'SUGESTAO',
  "mensagem"      TEXT NOT NULL,
  "status"        TEXT NOT NULL DEFAULT 'ABERTA',
  "resposta"      TEXT,
  "respondidoPor" TEXT,
  "respondidoEm"  TIMESTAMP(3),
  "criadoEm"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BonificacaoOuvidoria_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "BonificacaoOuvidoria_empresaId_status_idx" ON "BonificacaoOuvidoria"("empresaId", "status");

CREATE TABLE "BonificacaoContribuicao" (
  "id"            SERIAL NOT NULL,
  "empresaId"     INTEGER NOT NULL,
  "funcionarioId" INTEGER NOT NULL,
  "ano"           INTEGER NOT NULL,
  "mes"           INTEGER NOT NULL,
  "descricao"     TEXT NOT NULL,
  "pontos"        INTEGER NOT NULL DEFAULT 25,
  "coins"         INTEGER NOT NULL DEFAULT 0,
  "registradoPor" TEXT,
  "criadoEm"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BonificacaoContribuicao_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "BonificacaoContribuicao_empresaId_ano_mes_idx" ON "BonificacaoContribuicao"("empresaId", "ano", "mes");

CREATE TABLE "BonificacaoReconhecimento" (
  "id"                SERIAL NOT NULL,
  "empresaId"         INTEGER NOT NULL,
  "deFuncionarioId"   INTEGER NOT NULL,
  "paraFuncionarioId" INTEGER NOT NULL,
  "mensagem"          TEXT NOT NULL,
  "coins"             INTEGER NOT NULL DEFAULT 0,
  "status"            TEXT NOT NULL DEFAULT 'PENDENTE',
  "ano"               INTEGER NOT NULL,
  "mes"               INTEGER NOT NULL,
  "decididoPor"       TEXT,
  "decididoEm"        TIMESTAMP(3),
  "criadoEm"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BonificacaoReconhecimento_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "BonificacaoReconhecimento_empresaId_status_idx" ON "BonificacaoReconhecimento"("empresaId", "status");
