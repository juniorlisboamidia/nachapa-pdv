-- TV Indoor › PROGRAMAÇÃO SEMANAL V1
--
-- ADITIVA. Nada existente é alterado em comportamento: uma instalação sem nenhuma regra
-- continua resolvendo a programação por `Dispositivo.tvPlaylistId`, exatamente como antes.
-- O que muda é a SEMÂNTICA daquela coluna, que passa a se chamar "playlist padrão" — e
-- semântica não exige DDL.

-- O fuso DA LOJA, em IANA. Default explícito para as linhas que já existem: sem ele, toda
-- configuração salva antes desta migration ficaria com fuso nulo e a grade seria avaliada
-- no relógio do VPS — que é exatamente o que esta frente existe para não fazer.
ALTER TABLE "TvIndoorConfiguracao"
  ADD COLUMN IF NOT EXISTS "fusoHorario" TEXT NOT NULL DEFAULT 'America/Sao_Paulo';

CREATE TABLE "TvProgramacaoRegra" (
  "id"            SERIAL       NOT NULL,
  "empresaId"     INTEGER      NOT NULL,
  "dispositivoId" INTEGER      NOT NULL,
  "playlistId"    INTEGER      NOT NULL,
  "ativo"         BOOLEAN      NOT NULL DEFAULT true,
  -- ISO-8601: 1 = segunda … 7 = domingo.
  "dias"          INTEGER[]    NOT NULL,
  -- Minutos desde a meia-noite LOCAL. `inicioMin > fimMin` = janela que cruza a meia-noite.
  "inicioMin"     INTEGER      NOT NULL,
  "fimMin"        INTEGER      NOT NULL,
  "ordem"         INTEGER      NOT NULL DEFAULT 0,
  "criadoEm"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizadoEm"  TIMESTAMP(3) NOT NULL,

  CONSTRAINT "TvProgramacaoRegra_pkey" PRIMARY KEY ("id")
);

-- As invariantes do horário no BANCO, e não só no domínio. A régua da aplicação continua
-- sendo a primeira linha de defesa (ela responde com uma frase, não com um 500); estas
-- existem para que nenhuma escrita futura — script, migração de dados, correção manual —
-- consiga gravar uma janela que a grade não sabe interpretar.
ALTER TABLE "TvProgramacaoRegra"
  ADD CONSTRAINT "TvProgramacaoRegra_inicio_valido" CHECK ("inicioMin" >= 0 AND "inicioMin" < 1440),
  ADD CONSTRAINT "TvProgramacaoRegra_fim_valido"    CHECK ("fimMin"    >= 0 AND "fimMin"    < 1440),
  -- Janela NULA é recusada: "24 horas" e "zero minutos" são leituras igualmente defensáveis
  -- do mesmo dado, e uma grade não pode ter duas leituras.
  ADD CONSTRAINT "TvProgramacaoRegra_janela_nao_nula" CHECK ("inicioMin" <> "fimMin");

CREATE INDEX "TvProgramacaoRegra_empresaId_dispositivoId_ordem_idx"
  ON "TvProgramacaoRegra"("empresaId", "dispositivoId", "ordem");
CREATE INDEX "TvProgramacaoRegra_playlistId_idx" ON "TvProgramacaoRegra"("playlistId");

-- CASCADE nos dois: tela apagada não deixa grade órfã, e playlist apagada não deixa regra
-- apontando para um id que não existe (o que viraria uma tela muda num horário em que o
-- gestor jura que configurou).
ALTER TABLE "TvProgramacaoRegra"
  ADD CONSTRAINT "TvProgramacaoRegra_dispositivoId_fkey"
    FOREIGN KEY ("dispositivoId") REFERENCES "Dispositivo"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "TvProgramacaoRegra_playlistId_fkey"
    FOREIGN KEY ("playlistId") REFERENCES "TvPlaylist"("id") ON DELETE CASCADE ON UPDATE CASCADE;
