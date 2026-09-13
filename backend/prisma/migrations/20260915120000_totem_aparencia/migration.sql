-- Totem: aparência do canal (cores, logo, posição das categorias). Aditiva.
-- Nenhuma coluna com NOT NULL sem default: instalação existente continua com a aparência
-- de hoje, byte por byte, sem nenhum backfill.
ALTER TABLE "TotemConfiguracao" ADD COLUMN "logoDataUrl" TEXT;
ALTER TABLE "TotemConfiguracao" ADD COLUMN "logoVersao" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "TotemConfiguracao" ADD COLUMN "tokens" JSONB;
ALTER TABLE "TotemConfiguracao" ADD COLUMN "posicaoCategoriasPadrao" TEXT NOT NULL DEFAULT 'esquerda';

-- Por APARELHO: null = segue o padrão da loja.
ALTER TABLE "Dispositivo" ADD COLUMN "posicaoCategoriasOverride" TEXT;
