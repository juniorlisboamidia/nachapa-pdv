CREATE TABLE "ChecklistNotificacaoConfig" (
  "id" SERIAL PRIMARY KEY, "empresaId" INTEGER NOT NULL,
  "alertaImediatoAtivo" BOOLEAN NOT NULL DEFAULT false,
  "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "atualizadoEm" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "ChecklistNotificacaoConfig_empresaId_key" ON "ChecklistNotificacaoConfig"("empresaId");
CREATE INDEX "ChecklistNotificacaoConfig_empresaId_idx" ON "ChecklistNotificacaoConfig"("empresaId");

CREATE TABLE "ChecklistDestinatario" (
  "id" SERIAL PRIMARY KEY, "empresaId" INTEGER NOT NULL, "nome" TEXT NOT NULL, "whatsapp" TEXT NOT NULL,
  "ativo" BOOLEAN NOT NULL DEFAULT true,
  "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "atualizadoEm" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "ChecklistDestinatario_empresaId_idx" ON "ChecklistDestinatario"("empresaId");

CREATE TABLE "ChecklistNotificacaoLog" (
  "id" SERIAL PRIMARY KEY, "empresaId" INTEGER NOT NULL, "regra" TEXT NOT NULL, "canal" TEXT NOT NULL,
  "destino" TEXT NOT NULL, "destinatarioNome" TEXT, "execucaoId" INTEGER, "conteudo" TEXT NOT NULL,
  "status" TEXT NOT NULL, "erro" TEXT, "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "ChecklistNotificacaoLog_empresaId_criadoEm_idx" ON "ChecklistNotificacaoLog"("empresaId","criadoEm");
