-- TV Indoor › MENU BOARD V1 — o segundo tipo de item da programação, e a fita do produto
-- promovida a conceito neutro de canal.
--
-- ADITIVA e IDEMPOTENTE. As playlists existentes continuam funcionando sem edição manual:
-- `tipo` nasce com DEFAULT 'IMAGEM', e todo item já gravado tem `conteudoId` preenchido.
-- Ordena DEPOIS de 20260927120000_tv_indoor_v1 — nenhum timestamp histórico é tocado.

-- ── 1. A FITA VIRA NEUTRA ───────────────────────────────────────────────────────────────
-- `TotemFita` → `ProdutoFita`. A razão é de produto: marcar "Mais pedido" é uma decisão
-- sobre o PRODUTO da loja, não sobre um canal — o gestor marca uma vez e vale no totem e na
-- TV. O RENAME preserva 100% dos dados (nenhuma linha é lida, escrita ou apagada).
--
-- Condicional nos dois lados para ser reexecutável: só renomeia se a origem existir E o
-- destino não existir. Assim ela é inofensiva num banco que já rodou, e num que ainda não
-- chegou aqui (a 20260925 cria a tabela antes).
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'TotemFita')
     AND NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ProdutoFita') THEN
    ALTER TABLE "TotemFita" RENAME TO "ProdutoFita";
  END IF;
END $$;

-- Índices e chave primária acompanham o nome da tabela: um índice chamado "TotemFita_*"
-- numa tabela "ProdutoFita" funciona, mas é a pista falsa que o próximo a investigar segue.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'TotemFita_pkey')
     AND NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'ProdutoFita_pkey') THEN
    ALTER INDEX "TotemFita_pkey" RENAME TO "ProdutoFita_pkey";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'TotemFita_empresaId_cwItemId_key')
     AND NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'ProdutoFita_empresaId_cwItemId_key') THEN
    ALTER INDEX "TotemFita_empresaId_cwItemId_key" RENAME TO "ProdutoFita_empresaId_cwItemId_key";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'TotemFita_empresaId_idx')
     AND NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'ProdutoFita_empresaId_idx') THEN
    ALTER INDEX "TotemFita_empresaId_idx" RENAME TO "ProdutoFita_empresaId_idx";
  END IF;
END $$;

-- ── 2. O MENU BOARD ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "TvMenuBoard" (
  "id"              SERIAL NOT NULL,
  "empresaId"       INTEGER NOT NULL,
  "nome"            TEXT NOT NULL,
  "ativo"           BOOLEAN NOT NULL DEFAULT true,
  "layout"          TEXT NOT NULL DEFAULT 'GRADE',
  "duracaoSegundos" INTEGER NOT NULL DEFAULT 20,
  -- Referências e escolhas. NUNCA nome, preço, foto, promoção ou disponibilidade: esses
  -- vêm do catálogo a cada resolução.
  "configuracao"    JSONB NOT NULL DEFAULT '{}'::jsonb,
  "criadoEm"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizadoEm"    TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TvMenuBoard_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "TvMenuBoard_empresaId_idx" ON "TvMenuBoard"("empresaId");

-- ── 3. A PLAYLIST VIRA POLIMÓRFICA ──────────────────────────────────────────────────────
-- `tipo` com DEFAULT 'IMAGEM' é o que faz cada item já gravado continuar valendo no
-- instante em que esta migration roda — sem UPDATE de backfill, sem edição manual.
ALTER TABLE "TvPlaylistItem" ADD COLUMN IF NOT EXISTS "tipo" TEXT NOT NULL DEFAULT 'IMAGEM';
ALTER TABLE "TvPlaylistItem" ADD COLUMN IF NOT EXISTS "menuBoardId" INTEGER;
-- `conteudoId` deixa de ser obrigatório (um item MENU_BOARD não tem conteúdo). Os itens
-- existentes continuam com o valor que têm — afrouxar a coluna não mexe em dado nenhum.
ALTER TABLE "TvPlaylistItem" ALTER COLUMN "conteudoId" DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "TvPlaylistItem_playlistId_menuBoardId_key" ON "TvPlaylistItem"("playlistId", "menuBoardId");
CREATE INDEX IF NOT EXISTS "TvPlaylistItem_menuBoardId_idx" ON "TvPlaylistItem"("menuBoardId");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TvPlaylistItem_menuBoardId_fkey') THEN
    ALTER TABLE "TvPlaylistItem"
      ADD CONSTRAINT "TvPlaylistItem_menuBoardId_fkey"
      FOREIGN KEY ("menuBoardId") REFERENCES "TvMenuBoard"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- O CHECK da regra polimórfica: exatamente UMA referência, coerente com o `tipo`. A mesma
-- regra vive no domínio (tvMenuBoard.js) e na rota — este é o portão que nenhuma consulta
-- manual atravessa. Sem ele, um INSERT à mão criaria um item que o player não sabe tocar.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TvPlaylistItem_referencia_unica') THEN
    ALTER TABLE "TvPlaylistItem"
      ADD CONSTRAINT "TvPlaylistItem_referencia_unica" CHECK (
        ("tipo" = 'IMAGEM'     AND "conteudoId" IS NOT NULL AND "menuBoardId" IS NULL)
        OR
        ("tipo" = 'MENU_BOARD' AND "menuBoardId" IS NOT NULL AND "conteudoId" IS NULL)
      );
  END IF;
END $$;
