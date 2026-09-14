-- Totem: a esteira da vitrine passa a guardar a CHAVE do catálogo projetado, não o id
-- numérico do item. `item:12` é um item base; `opcao:12:5:88` é um complemento expandido
-- (a batata dentro do combo). Com `cwItemId` os complementos ficavam fora do alcance.
--
-- ── ESTA MIGRATION TEM DE FUNCIONAR EM DOIS MUNDOS ──────────────────────────────────
-- Num banco limpo, a 20260920 criou `cwItemId` e esta converte normalmente.
-- Em PRODUÇÃO, a primeira versão desta migration falhou no meio e o Prisma NÃO desfez o que
-- já tinha rodado: `cwItemId` foi apagada, `chave` existe com '' em todas as linhas, o
-- índice antigo saiu e o novo nunca entrou. Os ids daquelas linhas se perderam — não há
-- como saber que produtos eram — e a única saída honesta é removê-las e a loja escolher de
-- novo. Por isso cada passo é condicional.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'TotemDestaque' AND column_name = 'chave'
  ) THEN
    EXECUTE 'ALTER TABLE "TotemDestaque" ADD COLUMN "chave" TEXT';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'TotemDestaque' AND column_name = 'cwItemId'
  ) THEN
    -- Um cwItemId antigo era SEMPRE um item base, e a chave projetada de um item base é
    -- exatamente item:<id>: conversão exata, nenhuma escolha se perde neste caminho.
    EXECUTE 'UPDATE "TotemDestaque" SET "chave" = ''item:'' || "cwItemId" WHERE "chave" IS NULL OR "chave" = ''''';
    EXECUTE 'DROP INDEX IF EXISTS "TotemDestaque_empresaId_cwItemId_key"';
    EXECUTE 'ALTER TABLE "TotemDestaque" DROP COLUMN "cwItemId"';
  END IF;
END $$;

-- Linhas sem chave recuperável (o que a primeira tentativa deixou): saem. Chave vazia não
-- aponta para produto nenhum e duplicaria no índice único.
DELETE FROM "TotemDestaque" WHERE "chave" IS NULL OR "chave" = '';

ALTER TABLE "TotemDestaque" ALTER COLUMN "chave" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "TotemDestaque_empresaId_chave_key" ON "TotemDestaque"("empresaId", "chave");
