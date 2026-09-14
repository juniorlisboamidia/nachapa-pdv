-- Totem: a esteira da vitrine passa a guardar a CHAVE do catálogo projetado, não o id
-- numérico do item. `item:12` é um item base; `opcao:12:5:88` é um complemento expandido
-- (a batata dentro do combo). Com `cwItemId` os complementos ficavam fora do alcance e a
-- loja não chegava aos doze.
--
-- A tabela nasceu na 20260920 e nenhuma instalação a aplicou ainda, então não há linha a
-- converter. O DEFAULT '' existe só para o ADD COLUMN NOT NULL não falhar caso alguma
-- linha exista — e é removido em seguida, porque chave vazia não é chave.
DROP INDEX "TotemDestaque_empresaId_cwItemId_key";
ALTER TABLE "TotemDestaque" DROP COLUMN "cwItemId";
ALTER TABLE "TotemDestaque" ADD COLUMN "chave" TEXT NOT NULL DEFAULT '';
ALTER TABLE "TotemDestaque" ALTER COLUMN "chave" DROP DEFAULT;
CREATE UNIQUE INDEX "TotemDestaque_empresaId_chave_key" ON "TotemDestaque"("empresaId", "chave");
