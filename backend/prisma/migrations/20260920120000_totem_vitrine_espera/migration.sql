-- Totem: a tela de espera PADRÃO (a vitrine) — título, subtítulo e os produtos da esteira.
-- Aditiva: nenhuma coluna NOT NULL sem default, nenhuma tabela existente alterada em tipo.
--
-- Título e subtítulo são ANULÁVEIS e sem DEFAULT. NULL não é ausência de dado: é "a tela
-- não desenha esta linha", que é uma escolha de desenho legítima. Ao contrário do texto do
-- botão, aqui não existe padrão de fábrica — botão sem texto é botão quebrado, título
-- ausente não é.
ALTER TABLE "TotemConfiguracao" ADD COLUMN "tituloEspera" TEXT;
ALTER TABLE "TotemConfiguracao" ADD COLUMN "subtituloEspera" TEXT;

-- Os produtos da esteira. Guarda o ID do item no Cardápio Web e MAIS NADA: nome, preço e
-- foto vêm do catálogo vivo a cada bootstrap. Copiá-los para cá criaria uma segunda fonte
-- de verdade sobre preço, que é exatamente o erro que o resto do totem evita.
CREATE TABLE "TotemDestaque" (
  "id"        SERIAL NOT NULL,
  "empresaId" INTEGER NOT NULL,
  "cwItemId"  INTEGER NOT NULL,
  "ordem"     INTEGER NOT NULL DEFAULT 0,
  "criadoEm"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TotemDestaque_pkey" PRIMARY KEY ("id")
);
-- Unicidade por empresa: o mesmo produto não entra duas vezes na esteira.
CREATE UNIQUE INDEX "TotemDestaque_empresaId_cwItemId_key" ON "TotemDestaque"("empresaId", "cwItemId");
CREATE INDEX "TotemDestaque_empresaId_ordem_idx" ON "TotemDestaque"("empresaId", "ordem");

-- O FUNDO da vitrine entra como TERCEIRO TIPO de banner ('FUNDO'), e por isso não há coluna
-- nova para ele: `TotemBanner.tipo` já é TEXT com a régua no domínio (totemBanner.js).
-- Foi assim e não como coluna de imagem em TotemConfiguracao por performance: `logoDataUrl`
-- mora como data URL naquela linha, e a linha é lida em TODO bootstrap. Uma foto de tela
-- cheia ali seria regressão. Sem migration de dado — nenhuma linha existente muda de tipo.
