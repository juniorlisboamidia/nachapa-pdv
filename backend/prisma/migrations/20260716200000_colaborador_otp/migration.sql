-- Login da Área do Colaborador: código de acesso (OTP) enviado por WhatsApp. Aditivo.
CREATE TABLE "ColaboradorOtp" (
  "id"            SERIAL NOT NULL,
  "empresaId"     INTEGER NOT NULL,
  "funcionarioId" INTEGER NOT NULL,
  "telefone"      TEXT NOT NULL,
  "codigoHash"    TEXT NOT NULL,
  "expiraEm"      TIMESTAMP(3) NOT NULL,
  "tentativas"    INTEGER NOT NULL DEFAULT 0,
  "usado"         BOOLEAN NOT NULL DEFAULT false,
  "criadoEm"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ColaboradorOtp_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ColaboradorOtp_empresaId_telefone_criadoEm_idx" ON "ColaboradorOtp"("empresaId", "telefone", "criadoEm");
CREATE INDEX "ColaboradorOtp_funcionarioId_idx" ON "ColaboradorOtp"("funcionarioId");
