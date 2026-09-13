-- Totem: banners da tela de espera. Aditiva — duas tabelas novas, nada tocado.
-- `empresaId` sem FK (convenção do PDV). A ARTE fica em tabela própria para que uma
-- listagem sem `select` nunca arraste blobs para a memória.
CREATE TABLE "TotemBanner" (
  "id" SERIAL NOT NULL,
  "empresaId" INTEGER NOT NULL,
  "nome" TEXT NOT NULL,
  "ativo" BOOLEAN NOT NULL DEFAULT true,
  "ordem" INTEGER NOT NULL DEFAULT 0,
  "duracaoSegundos" INTEGER NOT NULL DEFAULT 6,
  "inicioEm" TIMESTAMP(3),
  "fimEm" TIMESTAMP(3),
  "imagemVersao" INTEGER NOT NULL DEFAULT 0,
  "imagemTipo" TEXT,
  "imagemBytes" INTEGER,
  "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizadoEm" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TotemBanner_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "TotemBanner_empresaId_ordem_idx" ON "TotemBanner"("empresaId", "ordem");

CREATE TABLE "TotemBannerImagem" (
  "bannerId" INTEGER NOT NULL,
  "dados" BYTEA NOT NULL,
  CONSTRAINT "TotemBannerImagem_pkey" PRIMARY KEY ("bannerId")
);
-- CASCADE: apagar o banner apaga a arte na mesma transação. É a estratégia de
-- consistência entre registro e mídia, e o motivo de não haver arquivo órfão possível.
ALTER TABLE "TotemBannerImagem" ADD CONSTRAINT "TotemBannerImagem_bannerId_fkey"
  FOREIGN KEY ("bannerId") REFERENCES "TotemBanner"("id") ON DELETE CASCADE ON UPDATE CASCADE;
