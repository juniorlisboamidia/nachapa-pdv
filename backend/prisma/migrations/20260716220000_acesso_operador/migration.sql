-- Operadores (gerentes) com acesso limitado por área, login por WhatsApp. Aditivo.
CREATE TABLE "AcessoOperador" (
  "id"           SERIAL NOT NULL,
  "empresaId"    INTEGER NOT NULL,
  "nome"         TEXT NOT NULL,
  "whatsapp"     TEXT NOT NULL,
  "areas"        TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "ativo"        BOOLEAN NOT NULL DEFAULT true,
  "ultimoAcesso" TIMESTAMP(3),
  "criadoEm"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizadoEm" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AcessoOperador_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AcessoOperador_empresaId_idx" ON "AcessoOperador"("empresaId");

-- OTP passa a servir também o login de operador (funcionarioId opcional).
ALTER TABLE "ColaboradorOtp" ALTER COLUMN "funcionarioId" DROP NOT NULL;
