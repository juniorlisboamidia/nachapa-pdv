-- TV Indoor: a agenda por data sai do ACERVO e vai para a PROGRAMAÇÃO.
--
-- A regra da grade semanal ganha um período opcional ("vale de 16/07 até 17/07"). Antes
-- isso morava na arte e no vídeo (começa/termina no conteúdo), o que fazia o acervo decidir
-- QUANDO algo vai ao ar — pergunta que é da programação.

ALTER TABLE "TvProgramacaoRegra" ADD COLUMN "validoDe" TIMESTAMP(3);
ALTER TABLE "TvProgramacaoRegra" ADD COLUMN "validoAte" TIMESTAMP(3);
-- Período invertido é erro, não "nunca vale".
ALTER TABLE "TvProgramacaoRegra" ADD CONSTRAINT "TvProgramacaoRegra_periodo_check"
  CHECK ("validoDe" IS NULL OR "validoAte" IS NULL OR "validoAte" > "validoDe");

-- As agendas que existiam em artes e vídeos são ZERADAS (decisão do Junior, 2026-09-17):
-- a tela deixa de mostrar e de editar esses campos, e um limite que não dá para ver nem
-- mexer é um comportamento invisível. O que estava agendado precisa ser refeito na grade.
UPDATE "TvConteudo" SET "inicioEm" = NULL, "fimEm" = NULL WHERE "inicioEm" IS NOT NULL OR "fimEm" IS NOT NULL;
UPDATE "TvVideo"    SET "inicioEm" = NULL, "fimEm" = NULL WHERE "inicioEm" IS NOT NULL OR "fimEm" IS NOT NULL;
