-- Ponto Facial › ingest do coletor DIXI.
ALTER TABLE "Funcionario" ADD COLUMN "enrollidColetor" INTEGER;
ALTER TABLE "Dispositivo" ADD COLUMN "serialColetor" TEXT;
ALTER TABLE "PontoRegistro" ADD COLUMN "coletorRef" TEXT;

CREATE UNIQUE INDEX "Funcionario_empresaId_enrollidColetor_key" ON "Funcionario"("empresaId", "enrollidColetor");
CREATE UNIQUE INDEX "Dispositivo_serialColetor_key" ON "Dispositivo"("serialColetor");
CREATE UNIQUE INDEX "PontoRegistro_coletorRef_key" ON "PontoRegistro"("coletorRef");

CREATE TABLE "ColetorBatidaPendente" (
  "id"            SERIAL NOT NULL,
  "empresaId"     INTEGER NOT NULL,
  "dispositivoId" INTEGER,
  "serial"        TEXT NOT NULL,
  "enrollid"      INTEGER NOT NULL,
  "nome"          TEXT,
  "dataHora"      TIMESTAMP(3) NOT NULL,
  "coletorRef"    TEXT NOT NULL,
  "resolvidoEm"   TIMESTAMP(3),
  "criadoEm"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ColetorBatidaPendente_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ColetorBatidaPendente_coletorRef_key" ON "ColetorBatidaPendente"("coletorRef");
CREATE INDEX "ColetorBatidaPendente_empresaId_resolvidoEm_idx" ON "ColetorBatidaPendente"("empresaId", "resolvidoEm");
CREATE INDEX "ColetorBatidaPendente_empresaId_enrollid_idx" ON "ColetorBatidaPendente"("empresaId", "enrollid");
