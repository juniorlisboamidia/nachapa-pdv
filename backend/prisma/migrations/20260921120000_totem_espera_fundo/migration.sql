-- Totem: a FOTO DE FUNDO da vitrine (tela de espera padrão). Aditiva.
--
-- Corrige a direção da migration anterior (20260920, "totem_vitrine_espera"), cujo
-- comentário previa o fundo como um terceiro tipo de banner. Não é: banner é lista, com
-- agenda e rodízio; a vitrine tem UMA foto, que é o padrão da loja. Nenhuma linha de
-- TotemBanner chegou a existir com tipo 'FUNDO' — aquela migration não gravou dado.
--
-- Os bytes ficam FORA de TotemConfiguracao, em tabela própria com o empresaId como chave:
-- a linha de configuração é lida em todo bootstrap, e uma foto de tela cheia dentro dela
-- seria regressão. Só a versão fica na configuração — é o que invalida o cache do tablet,
-- e sobe também na remoção.
ALTER TABLE "TotemConfiguracao" ADD COLUMN "fundoEsperaVersao" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "TotemEsperaFundo" (
  "empresaId"    INTEGER NOT NULL,
  "tipo"         TEXT NOT NULL,
  "dados"        BYTEA NOT NULL,
  "atualizadoEm" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TotemEsperaFundo_pkey" PRIMARY KEY ("empresaId")
);
