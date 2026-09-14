-- Totem: as fitas passam a usar o MESMO catálogo do HUB (Mais pedido, Recomendado,
-- Novidade, Edição limitada, Oferta). A primeira rodada tinha outros códigos; esta migration
-- CONVERTE o que já foi gravado em vez de deixar linha morta — a leitura ignora código
-- desconhecido, mas o admin mostraria "Sem fita" com uma linha por baixo.
--   NOVO      → NOVIDADE      (mesma ideia)
--   DESTAQUE  → RECOMENDADO   (o mais próximo)
--   COMBO, EXCLUSIVO → sem equivalente: a linha sai, e a loja escolhe de novo.
-- Idempotente: rodar de novo não encontra nada para mudar.
UPDATE "TotemFita" SET "selo" = 'NOVIDADE'    WHERE "selo" = 'NOVO';
UPDATE "TotemFita" SET "selo" = 'RECOMENDADO' WHERE "selo" = 'DESTAQUE';
DELETE FROM "TotemFita" WHERE "selo" IN ('COMBO', 'EXCLUSIVO');
