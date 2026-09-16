-- TV Indoor › MENU BOARDS V2 — templates e composição visual
--
-- ADITIVA e conservadora. Nenhum board existente muda de aparência: os defaults abaixo
-- reproduzem exatamente o que o V1 desenhava, e os três templates antigos (GRADE, LISTA,
-- DESTAQUE) mantêm id, capacidade e semântica. VITRINE e OFERTA são novos e ninguém está
-- neles ainda.

ALTER TABLE "TvMenuBoard"
  ADD COLUMN IF NOT EXISTS "titulo"    TEXT,
  ADD COLUMN IF NOT EXISTS "subtitulo" TEXT,
  -- O V1 não desenhava logo no board.
  ADD COLUMN IF NOT EXISTS "mostrarLogo"      BOOLEAN NOT NULL DEFAULT false,
  -- O V1 mostrava descrição só na Lista e no produto grande do Destaque — e esses dois
  -- continuam mostrando por COMPOSIÇÃO, sem depender desta chave.
  ADD COLUMN IF NOT EXISTS "mostrarDescricao" BOOLEAN NOT NULL DEFAULT false,
  -- Só a Lista lê esta chave; os demais templates mostram foto sempre. A Lista do V1 não
  -- tinha foto, então o default é false.
  ADD COLUMN IF NOT EXISTS "mostrarImagem"    BOOLEAN NOT NULL DEFAULT false,
  -- A fita sempre apareceu.
  ADD COLUMN IF NOT EXISTS "mostrarFita"      BOOLEAN NOT NULL DEFAULT true;

-- O TÍTULO sai do JSON e vira coluna. A cópia é feita aqui, uma vez, e o JSON é deixado
-- intacto de propósito: se algo der errado no deploy, o dado original continua onde estava.
-- O domínio lê a coluna e só cai no JSON quando ela é nula.
UPDATE "TvMenuBoard"
   SET "titulo" = NULLIF(TRIM("configuracao" ->> 'titulo'), '')
 WHERE "titulo" IS NULL
   AND "configuracao" ? 'titulo';
