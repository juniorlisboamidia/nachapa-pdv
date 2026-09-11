-- Totem de autoatendimento (Fase A, §3.1): pareamento por código temporário +
-- credencial de cookie, e heartbeat do aparelho. `token` permanece NOT NULL.
ALTER TABLE "Dispositivo" ADD COLUMN "pareamentoCodigo" TEXT;
ALTER TABLE "Dispositivo" ADD COLUMN "pareamentoExpiraEm" TIMESTAMP(3);
ALTER TABLE "Dispositivo" ADD COLUMN "pareamentoTentativas" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Dispositivo" ADD COLUMN "credencialHash" TEXT;
ALTER TABLE "Dispositivo" ADD COLUMN "pareadoEm" TIMESTAMP(3);
ALTER TABLE "Dispositivo" ADD COLUMN "ultimoHeartbeatEm" TIMESTAMP(3);
ALTER TABLE "Dispositivo" ADD COLUMN "heartbeatJson" JSONB;
CREATE UNIQUE INDEX "Dispositivo_pareamentoCodigo_key" ON "Dispositivo"("pareamentoCodigo");
CREATE UNIQUE INDEX "Dispositivo_credencialHash_key" ON "Dispositivo"("credencialHash");
CREATE INDEX "Dispositivo_empresaId_tipo_idx" ON "Dispositivo"("empresaId", "tipo");
