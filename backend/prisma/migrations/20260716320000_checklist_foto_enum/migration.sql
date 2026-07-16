-- FOTO no enum, numa migration ISOLADA: o Postgres não deixa usar um valor de
-- enum novo na mesma transação em que ele é adicionado. O INSERT que usa FOTO
-- (itens dos templates) fica na migration seguinte.
ALTER TYPE "TipoItemChecklist" ADD VALUE IF NOT EXISTS 'FOTO';
