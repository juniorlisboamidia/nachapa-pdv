-- Totem de autoatendimento (Fase A, §5.3): outbox/auditoria dos pedidos criados
-- no Cardápio Web. `empresaId` sem FK (convenção do PDV).
CREATE TABLE "PedidoTotemEnvio" (
  "id" SERIAL NOT NULL, "empresaId" INTEGER NOT NULL, "dispositivoId" INTEGER NOT NULL,
  "chaveIdempotencia" TEXT NOT NULL, "orderId" TEXT NOT NULL, "displayIdEnviado" TEXT NOT NULL,
  "orderType" TEXT NOT NULL, "status" TEXT NOT NULL,
  "cwOrderId" INTEGER, "cwDisplayId" INTEGER, "cwStatusInicial" TEXT,
  "totalCalculado" DECIMAL(12,2), "cotacaoHash" TEXT,
  "carrinhoJson" JSONB NOT NULL, "respostaJson" JSONB, "erroCodigo" TEXT, "erroDetalhe" TEXT,
  "tentadoEm" TIMESTAMP(3) NOT NULL, "reconciliadoEm" TIMESTAMP(3), "revisaoEm" TIMESTAMP(3), "decisaoJson" JSONB,
  "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "atualizadoEm" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PedidoTotemEnvio_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PedidoTotemEnvio_dispositivoId_fkey" FOREIGN KEY ("dispositivoId") REFERENCES "Dispositivo"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "PedidoTotemEnvio_orderId_key" ON "PedidoTotemEnvio"("orderId");
CREATE UNIQUE INDEX "PedidoTotemEnvio_dispositivoId_chaveIdempotencia_key" ON "PedidoTotemEnvio"("dispositivoId", "chaveIdempotencia");
CREATE INDEX "PedidoTotemEnvio_empresaId_criadoEm_idx" ON "PedidoTotemEnvio"("empresaId", "criadoEm");
CREATE INDEX "PedidoTotemEnvio_empresaId_status_idx" ON "PedidoTotemEnvio"("empresaId", "status");
