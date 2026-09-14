-- Totem: a esteira da vitrine passa a guardar a CHAVE do catálogo projetado, não o id
-- numérico do item. `item:12` é um item base; `opcao:12:5:88` é um complemento expandido
-- (a batata dentro do combo). Com `cwItemId` os complementos ficavam fora do alcance e a
-- loja não chegava aos doze.
--
-- CONVERTE o que já existe, não substitui. A primeira versão desta migration presumia
-- tabela vazia, dava DEFAULT '' às linhas e o índice único falhou em produção com seis
-- destaques gravados (chave vazia duplicada). Um `cwItemId` antigo era SEMPRE um item base,
-- e a chave projetada de um item base é `item:<id>` — então a conversão é exata e nenhuma
-- escolha da loja se perde.
--
-- A ordem importa: a chave nasce anulável, é preenchida, e SÓ ENTÃO vira NOT NULL; o índice
-- novo entra depois de a coluna velha (e o índice velho) saírem. Tudo numa transação.
ALTER TABLE "TotemDestaque" ADD COLUMN "chave" TEXT;
UPDATE "TotemDestaque" SET "chave" = 'item:' || "cwItemId";
ALTER TABLE "TotemDestaque" ALTER COLUMN "chave" SET NOT NULL;
DROP INDEX "TotemDestaque_empresaId_cwItemId_key";
ALTER TABLE "TotemDestaque" DROP COLUMN "cwItemId";
CREATE UNIQUE INDEX "TotemDestaque_empresaId_chave_key" ON "TotemDestaque"("empresaId", "chave");
