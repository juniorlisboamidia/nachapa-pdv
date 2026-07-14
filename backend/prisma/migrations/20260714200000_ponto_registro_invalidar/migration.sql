-- Marcação pode receber observação e ser "desconsiderada" (invalidada, não conta no cálculo).
ALTER TABLE "PontoRegistro" ADD COLUMN "observacao" TEXT;
ALTER TABLE "PontoRegistro" ADD COLUMN "invalidada" BOOLEAN NOT NULL DEFAULT false;
