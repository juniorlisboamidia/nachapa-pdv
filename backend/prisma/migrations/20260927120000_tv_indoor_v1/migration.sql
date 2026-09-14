-- TV INDOOR V1 — conteúdos, programação (playlist) e o vínculo TV ↔ playlist.
--
-- SÓ ADITIVA e IDEMPOTENTE: nenhuma tabela existente muda de tipo, nenhuma coluna existente
-- é convertida, e rodar de novo sobre um banco que já tem tudo não faz nada. A única
-- mudança em tabela existente é uma coluna NULÁVEL em Dispositivo.
--
-- Não há dado de TV em produção (nenhum Dispositivo TV_INDOOR foi cadastrado até aqui), então
-- não existe conversão de dado a fazer — o que houvesse seria convertido, nunca zerado.

-- A peça de mídia: imagem, nome, duração e agenda.
CREATE TABLE IF NOT EXISTS "TvConteudo" (
  "id"              SERIAL NOT NULL,
  "empresaId"       INTEGER NOT NULL,
  "nome"            TEXT NOT NULL,
  "ativo"           BOOLEAN NOT NULL DEFAULT true,
  "duracaoSegundos" INTEGER NOT NULL DEFAULT 10,
  "inicioEm"        TIMESTAMP(3),
  "fimEm"           TIMESTAMP(3),
  "imagemVersao"    INTEGER NOT NULL DEFAULT 0,
  "imagemTipo"      TEXT,
  "imagemBytes"     INTEGER,
  "criadoEm"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizadoEm"    TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TvConteudo_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "TvConteudo_empresaId_idx" ON "TvConteudo"("empresaId");

-- Os BYTES, em tabela própria: a listagem do admin nunca os carrega por acidente.
CREATE TABLE IF NOT EXISTS "TvConteudoImagem" (
  "conteudoId" INTEGER NOT NULL,
  "dados"      BYTEA NOT NULL,
  CONSTRAINT "TvConteudoImagem_pkey" PRIMARY KEY ("conteudoId")
);

-- A programação. Uma playlist pode servir várias telas.
CREATE TABLE IF NOT EXISTS "TvPlaylist" (
  "id"           SERIAL NOT NULL,
  "empresaId"    INTEGER NOT NULL,
  "nome"         TEXT NOT NULL,
  "criadoEm"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizadoEm" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TvPlaylist_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "TvPlaylist_empresaId_idx" ON "TvPlaylist"("empresaId");

-- O conteúdo dentro da programação, na ordem.
CREATE TABLE IF NOT EXISTS "TvPlaylistItem" (
  "id"         SERIAL NOT NULL,
  "playlistId" INTEGER NOT NULL,
  "conteudoId" INTEGER NOT NULL,
  "ordem"      INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "TvPlaylistItem_pkey" PRIMARY KEY ("id")
);
-- O mesmo conteúdo não entra duas vezes na mesma playlist.
CREATE UNIQUE INDEX IF NOT EXISTS "TvPlaylistItem_playlistId_conteudoId_key" ON "TvPlaylistItem"("playlistId", "conteudoId");
CREATE INDEX IF NOT EXISTS "TvPlaylistItem_playlistId_ordem_idx" ON "TvPlaylistItem"("playlistId", "ordem");
CREATE INDEX IF NOT EXISTS "TvPlaylistItem_conteudoId_idx" ON "TvPlaylistItem"("conteudoId");

-- A TV aponta para a sua programação. NULÁVEL: sem playlist a tela mostra o fallback
-- institucional, que é estado legítimo.
ALTER TABLE "Dispositivo" ADD COLUMN IF NOT EXISTS "tvPlaylistId" INTEGER;
CREATE INDEX IF NOT EXISTS "Dispositivo_tvPlaylistId_idx" ON "Dispositivo"("tvPlaylistId");

-- ── Chaves estrangeiras ─────────────────────────────────────────────────────────────────
-- `ADD CONSTRAINT` não aceita IF NOT EXISTS no Postgres 16, então cada uma vai dentro de um
-- bloco que confere antes: é o que torna a migration reexecutável sobre um banco em que ela
-- já rodou pela metade (a armadilha que o 20260922 do totem custou caro para aprender).
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TvConteudoImagem_conteudoId_fkey') THEN
    ALTER TABLE "TvConteudoImagem"
      ADD CONSTRAINT "TvConteudoImagem_conteudoId_fkey"
      FOREIGN KEY ("conteudoId") REFERENCES "TvConteudo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TvPlaylistItem_playlistId_fkey') THEN
    ALTER TABLE "TvPlaylistItem"
      ADD CONSTRAINT "TvPlaylistItem_playlistId_fkey"
      FOREIGN KEY ("playlistId") REFERENCES "TvPlaylist"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TvPlaylistItem_conteudoId_fkey') THEN
    ALTER TABLE "TvPlaylistItem"
      ADD CONSTRAINT "TvPlaylistItem_conteudoId_fkey"
      FOREIGN KEY ("conteudoId") REFERENCES "TvConteudo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- SET NULL: apagar a playlist não apaga a TV nem trava o delete — a tela cai no fallback.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Dispositivo_tvPlaylistId_fkey') THEN
    ALTER TABLE "Dispositivo"
      ADD CONSTRAINT "Dispositivo_tvPlaylistId_fkey"
      FOREIGN KEY ("tvPlaylistId") REFERENCES "TvPlaylist"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
