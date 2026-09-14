-- Totem: a frase da faixa que liga as duas metades da vitrine. Aditiva, anulável, sem
-- DEFAULT no banco (o padrão "Nossos produtos" mora no domínio) e IDEMPOTENTE.
ALTER TABLE "TotemConfiguracao" ADD COLUMN IF NOT EXISTS "fraseMeioEspera" TEXT;
