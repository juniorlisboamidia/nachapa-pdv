-- Execucao publica do Checklist (link+PIN, sem OTP): token publico por checklist e PIN
-- de 4 digitos no funcionario. Aditivo — nada muda para quem ja usa a Area do Colaborador.
ALTER TABLE "Checklist" ADD COLUMN "publicoToken" TEXT;
CREATE UNIQUE INDEX "Checklist_publicoToken_key" ON "Checklist"("publicoToken");
ALTER TABLE "Funcionario" ADD COLUMN "pin" TEXT;
