ALTER TABLE "Dispositivo" ADD COLUMN "tipo" TEXT NOT NULL DEFAULT 'PONTO';

-- tablets-quiosque existentes (sem serial) eram usados por Etiquetas → viram ETIQUETA;
-- coletores DIXI (com serial) são do Ponto Facial → ficam PONTO (default).
UPDATE "Dispositivo" SET "tipo" = 'ETIQUETA' WHERE "serialColetor" IS NULL;
