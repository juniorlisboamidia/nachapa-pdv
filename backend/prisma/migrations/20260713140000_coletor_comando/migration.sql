-- Fila de comandos a enviar pro coletor (downlink: cadastro de usuário etc.).
CREATE TABLE "ColetorComando" (
  "id"            SERIAL NOT NULL,
  "empresaId"     INTEGER NOT NULL,
  "serial"        TEXT NOT NULL,
  "funcionarioId" INTEGER,
  "enrollid"      INTEGER NOT NULL,
  "cmd"           TEXT NOT NULL DEFAULT 'setuserinfo',
  "payload"       JSONB NOT NULL,
  "status"        TEXT NOT NULL DEFAULT 'PENDENTE',
  "enviadoEm"     TIMESTAMP(3),
  "criadoEm"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ColetorComando_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ColetorComando_serial_status_idx" ON "ColetorComando"("serial", "status");
CREATE INDEX "ColetorComando_empresaId_idx" ON "ColetorComando"("empresaId");
