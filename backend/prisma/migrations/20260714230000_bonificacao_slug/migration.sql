-- Apelido amigável do link público da bonificação (ex.: /bonificacao/ranking).
ALTER TABLE "BonificacaoConfig" ADD COLUMN "slugPublico" TEXT;
CREATE UNIQUE INDEX "BonificacaoConfig_slugPublico_key" ON "BonificacaoConfig"("slugPublico");
