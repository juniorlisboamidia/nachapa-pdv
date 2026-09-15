-- TV Indoor › VÍDEO V1 — o terceiro tipo de item da programação.
--
-- ADITIVA e IDEMPOTENTE. As playlists existentes continuam funcionando: o CHECK antigo é
-- substituído por um que aceita tudo o que ele aceitava, mais o tipo novo. Ordena depois de
-- 20260929120000_tv_aparencia_v1; nenhum timestamp histórico é tocado.
--
-- ⚠️ OS BYTES NÃO ESTÃO AQUI. `storageKey` é uma chave OPACA que aponta para um arquivo em
-- PDV_MEDIA_DIR (default /var/lib/nachapa-pdv/media/tv-indoor/videos/), FORA do repositório.
-- BYTEA seria errado para vídeo: o driver materializa o blob inteiro no heap a cada
-- requisição, um Range exigiria substring() no SQL, e o dump do banco passaria a gigabytes.
-- Ver docs/superpowers/specs/2026-09-14-tv-video-v1-design.md §2.

CREATE TABLE IF NOT EXISTS "TvVideo" (
  "id"            SERIAL NOT NULL,
  "empresaId"     INTEGER NOT NULL,
  "nome"          TEXT NOT NULL,
  "ativo"         BOOLEAN NOT NULL DEFAULT true,
  -- Agenda em INSTANTE ABSOLUTO, como o resto do canal. Ela decide se o vídeo pode COMEÇAR;
  -- um vídeo que já está tocando quando o fim passa termina (regra do player).
  "inicioEm"      TIMESTAMP(3),
  "fimEm"         TIMESTAMP(3),
  -- Sobe SÓ quando o arquivo muda. É ela que invalida o cache de um ano da TV; trocar nome
  -- ou agenda não encosta aqui.
  "arquivoVersao" INTEGER NOT NULL DEFAULT 0,
  "arquivoTipo"   TEXT,
  "arquivoBytes"  BIGINT,
  -- Chave OPACA gerada pelo servidor (<empresaId>/<hex32>.<ext>). Nunca sai para o cliente,
  -- nem para exibição: a TV recebe uma URL versionada.
  "storageKey"    TEXT,
  -- INFORMATIVAS: vieram do <video> do navegador de quem enviou, porque o servidor não tem
  -- ffprobe. O player NUNCA as usa — ele avança no evento `ended`.
  "duracaoMs"     INTEGER,
  "largura"       INTEGER,
  "altura"        INTEGER,
  "nomeOriginal"  TEXT,
  "criadoEm"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizadoEm"  TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TvVideo_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "TvVideo_empresaId_idx" ON "TvVideo"("empresaId");

-- ── A playlist ganha o terceiro tipo ────────────────────────────────────────────────────
ALTER TABLE "TvPlaylistItem" ADD COLUMN IF NOT EXISTS "videoId" INTEGER;
CREATE UNIQUE INDEX IF NOT EXISTS "TvPlaylistItem_playlistId_videoId_key" ON "TvPlaylistItem"("playlistId", "videoId");
CREATE INDEX IF NOT EXISTS "TvPlaylistItem_videoId_idx" ON "TvPlaylistItem"("videoId");

-- CASCADE: excluir o vídeo remove as ocorrências dele nas playlists, na mesma transação.
-- Sem isso, o CHECK abaixo transformaria "excluir um vídeo" num erro de constraint.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TvPlaylistItem_videoId_fkey') THEN
    ALTER TABLE "TvPlaylistItem"
      ADD CONSTRAINT "TvPlaylistItem_videoId_fkey"
      FOREIGN KEY ("videoId") REFERENCES "TvVideo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- O CHECK polimórfico passa a cobrir TRÊS tipos: exatamente uma referência, coerente com o
-- `tipo`. O antigo é derrubado primeiro — um CHECK não se "altera", se troca. Toda linha que
-- passava no antigo passa no novo (IMAGEM e MENU_BOARD têm `videoId` nulo), então nenhum
-- dado existente é rejeitado.
ALTER TABLE "TvPlaylistItem" DROP CONSTRAINT IF EXISTS "TvPlaylistItem_referencia_unica";
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TvPlaylistItem_referencia_unica') THEN
    ALTER TABLE "TvPlaylistItem"
      ADD CONSTRAINT "TvPlaylistItem_referencia_unica" CHECK (
        ("tipo" = 'IMAGEM'     AND "conteudoId"  IS NOT NULL AND "menuBoardId" IS NULL AND "videoId" IS NULL)
        OR
        ("tipo" = 'MENU_BOARD' AND "menuBoardId" IS NOT NULL AND "conteudoId"  IS NULL AND "videoId" IS NULL)
        OR
        ("tipo" = 'VIDEO'      AND "videoId"     IS NOT NULL AND "conteudoId"  IS NULL AND "menuBoardId" IS NULL)
      );
  END IF;
END $$;
