-- Lembrete de atraso do checklist: config (ativo/template/minutos antes), tipo do destinatário
-- (IMEDIATO x ATRASO) e dedup de disparo por checklist+dia. Aditivo — checklists existentes
-- seguem alertaImediatoAtivo/destinatarios como hoje (lembreteAtivo nasce desligado).
ALTER TABLE "ChecklistNotificacaoConfig" ADD COLUMN "lembreteAtivo" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ChecklistNotificacaoConfig" ADD COLUMN "lembreteTemplate" TEXT NOT NULL DEFAULT '';
ALTER TABLE "ChecklistNotificacaoConfig" ADD COLUMN "lembreteMinutosAntes" INTEGER NOT NULL DEFAULT 30;

ALTER TABLE "ChecklistDestinatario" ADD COLUMN "tipo" TEXT NOT NULL DEFAULT 'IMEDIATO';

CREATE TABLE "ChecklistLembreteEnviado" (
  "id" SERIAL PRIMARY KEY, "empresaId" INTEGER NOT NULL, "checklistId" INTEGER NOT NULL,
  "dataRef" TIMESTAMP(3) NOT NULL, "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "ChecklistLembreteEnviado_empresaId_checklistId_dataRef_key" ON "ChecklistLembreteEnviado"("empresaId","checklistId","dataRef");
CREATE INDEX "ChecklistLembreteEnviado_empresaId_idx" ON "ChecklistLembreteEnviado"("empresaId");
