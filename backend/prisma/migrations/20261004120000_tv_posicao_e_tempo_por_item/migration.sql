-- TV Indoor: posição física da tela + duração por item da playlist.
-- ADITIVA: nenhuma linha existente muda de comportamento. Toda TV continua PAISAGEM sem
-- rotação, e todo item de playlist continua usando a duração do próprio conteúdo/board.

-- A posição física da TV. Orientação é declarada; rotação é a correção mecânica.
ALTER TABLE "Dispositivo" ADD COLUMN "tvOrientacao" TEXT;
ALTER TABLE "Dispositivo" ADD COLUMN "tvRotacao" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Dispositivo" ADD COLUMN "tvAjusteAte" TIMESTAMP(3);

-- Regra que só existe no aplicativo é regra que a primeira consulta manual quebra.
ALTER TABLE "Dispositivo" ADD CONSTRAINT "Dispositivo_tvOrientacao_check"
  CHECK ("tvOrientacao" IS NULL OR "tvOrientacao" IN ('PAISAGEM', 'RETRATO'));
ALTER TABLE "Dispositivo" ADD CONSTRAINT "Dispositivo_tvRotacao_check"
  CHECK ("tvRotacao" IN (0, 90, 180, 270));

-- A duração passa a poder ser do ITEM. Nulo = padrão do conteúdo/board.
ALTER TABLE "TvPlaylistItem" ADD COLUMN "duracaoSegundos" INTEGER;
ALTER TABLE "TvPlaylistItem" ADD CONSTRAINT "TvPlaylistItem_duracaoSegundos_check"
  CHECK ("duracaoSegundos" IS NULL OR ("duracaoSegundos" BETWEEN 3 AND 120));
-- Vídeo dura o que dura: uma duração ali seria um número que ninguém lê.
ALTER TABLE "TvPlaylistItem" ADD CONSTRAINT "TvPlaylistItem_duracao_sem_video_check"
  CHECK ("tipo" <> 'VIDEO' OR "duracaoSegundos" IS NULL);
