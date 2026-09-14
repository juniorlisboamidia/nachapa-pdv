-- TV Indoor › APARÊNCIA V1 — a identidade visual PRÓPRIA do canal: seis cores e uma logo.
--
-- ADITIVA e IDEMPOTENTE. Nenhuma tabela existente é alterada, nenhum model do Totem é
-- tocado. Ordena depois de 20260928120000_tv_menu_board_v1; nenhum timestamp histórico muda.
--
-- Empresa sem linha aqui continua desenhando com os defaults embarcados
-- (backend/tvIndoorAparencia.js): a configuração é OPCIONAL, e sua ausência é o estado
-- normal de quem nunca personalizou.

CREATE TABLE IF NOT EXISTS "TvIndoorConfiguracao" (
  "id"           SERIAL NOT NULL,
  "empresaId"    INTEGER NOT NULL,
  -- Overrides ESPARSOS das cores, em chaves de DOMÍNIO (fundo, superficie, texto…), NUNCA
  -- `--tvmb-fundo`: o banco não pode conhecer nome de custom property, senão renomear um
  -- token da folha invalidaria a configuração de todas as lojas. A paleta inteira não é
  -- obrigatória — o que não está aqui vale o padrão embarcado.
  "tokens"       JSONB,
  -- Sobe ao TROCAR e ao REMOVER a logo. É ela que invalida o cache de um ano da TV sem
  -- depender de o navegador reconsultar. Mexer em COR não encosta aqui.
  "logoVersao"   INTEGER NOT NULL DEFAULT 0,
  "logoTipo"     TEXT,
  -- Tamanho em bytes, para a tela informar sem carregar o blob.
  "logoBytes"    INTEGER,
  "criadoEm"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizadoEm" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TvIndoorConfiguracao_pkey" PRIMARY KEY ("id")
);
-- Uma configuração por empresa: é o que faz o upsert por `empresaId` ser seguro.
CREATE UNIQUE INDEX IF NOT EXISTS "TvIndoorConfiguracao_empresaId_key" ON "TvIndoorConfiguracao"("empresaId");

-- Os BYTES da logo, em tabela própria — e não numa coluna da configuração.
--
-- A razão é de leitura: a configuração é lida em TODA programação (a cada 60 s, por tela) e
-- em toda abertura do admin. Com o blob na mesma linha, um `findUnique` sem `select`
-- arrastaria a imagem inteira nessas duas rotas quentes. Separada, esse erro é IMPOSSÍVEL
-- em vez de improvável — a mesma decisão de TvConteudoImagem e TotemEsperaFundo.
CREATE TABLE IF NOT EXISTS "TvIndoorLogo" (
  "configuracaoId" INTEGER NOT NULL,
  "dados"          BYTEA NOT NULL,
  CONSTRAINT "TvIndoorLogo_pkey" PRIMARY KEY ("configuracaoId")
);

-- CASCADE: apagar a configuração apaga a logo na mesma transação. Não existe arquivo órfão
-- porque não existe arquivo — foi um dos motivos de guardar bytes no banco.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TvIndoorLogo_configuracaoId_fkey') THEN
    ALTER TABLE "TvIndoorLogo"
      ADD CONSTRAINT "TvIndoorLogo_configuracaoId_fkey"
      FOREIGN KEY ("configuracaoId") REFERENCES "TvIndoorConfiguracao"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
