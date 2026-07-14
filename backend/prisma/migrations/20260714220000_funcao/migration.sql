-- Funções/cargos da equipe (lista pré-definida) + flag de participação na Bonificação.
CREATE TABLE "Funcao" (
  "id"           SERIAL NOT NULL,
  "empresaId"    INTEGER NOT NULL,
  "nome"         TEXT NOT NULL,
  "bonificavel"  BOOLEAN NOT NULL DEFAULT true,
  "ordem"        INTEGER NOT NULL DEFAULT 0,
  "criadoEm"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizadoEm" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Funcao_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Funcao_empresaId_nome_key" ON "Funcao"("empresaId", "nome");
CREATE INDEX "Funcao_empresaId_idx" ON "Funcao"("empresaId");
