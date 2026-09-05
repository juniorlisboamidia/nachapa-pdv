-- Motoboys (portado do H360: 20260804120000_motoboy_status_pendente + 20260804160000_motoboys_config
-- + 20260804140000_empresa_whatsapp_contato). Tudo aditivo.
ALTER TYPE "MotoboyStatus" ADD VALUE IF NOT EXISTS 'PENDENTE';
ALTER TABLE "Empresa" ADD COLUMN IF NOT EXISTS "motoboyContatoWhatsapp" TEXT;
ALTER TABLE "Empresa" ADD COLUMN IF NOT EXISTS "motoboyBloqueadoPodeEscalar" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Empresa" ADD COLUMN IF NOT EXISTS "motoboyPerguntaCnh" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Motoboy" ADD COLUMN IF NOT EXISTS "possuiCnh" BOOLEAN;
ALTER TABLE "Empresa" ADD COLUMN IF NOT EXISTS "whatsappEmpresa" TEXT;
ALTER TABLE "Empresa" ADD COLUMN IF NOT EXISTS "whatsappContato" TEXT DEFAULT 'RESPONSAVEL';
