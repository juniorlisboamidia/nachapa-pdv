-- Alinha o banco ao schema: `atualizadoEm DateTime @updatedAt` (sem @default).
--
-- A migration 20260716280000_etiquetas criou as 3 tabelas novas com
-- `atualizadoEm TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP`, mas o schema.prisma
-- declara só `@updatedAt`. Das 46 tabelas com esse campo, apenas estas 3 tinham DEFAULT —
-- as outras 43 seguem o que o Prisma geraria. Era drift: o próximo `migrate diff` ia
-- querer reverter isso sozinho, e um DROP DEFAULT no meio de outra migration é a hora
-- errada de descobrir o assunto.
--
-- Não muda comportamento: quem escreve `atualizadoEm` é sempre o Prisma (@updatedAt
-- preenche no create e no update), então o DEFAULT nunca chegava a ser usado pela app.
-- Forward-only de propósito: a 280000 já rodou em produção e migration aplicada não se
-- edita.
ALTER TABLE "EtiquetaConfig" ALTER COLUMN "atualizadoEm" DROP DEFAULT;
ALTER TABLE "EtiquetaRegra" ALTER COLUMN "atualizadoEm" DROP DEFAULT;
ALTER TABLE "EtiquetaItemConfig" ALTER COLUMN "atualizadoEm" DROP DEFAULT;
