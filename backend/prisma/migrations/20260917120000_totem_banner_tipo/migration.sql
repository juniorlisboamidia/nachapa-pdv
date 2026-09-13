-- Totem: banner ganha TIPO. Aditiva, com default — os banners existentes continuam
-- sendo da tela de espera, exatamente onde estão hoje.
ALTER TABLE "TotemBanner" ADD COLUMN "tipo" TEXT NOT NULL DEFAULT 'ESPERA';

-- O índice passa a incluir o tipo: as duas listas são consultadas separadamente.
DROP INDEX "TotemBanner_empresaId_ordem_idx";
CREATE INDEX "TotemBanner_empresaId_tipo_ordem_idx" ON "TotemBanner"("empresaId", "tipo", "ordem");
