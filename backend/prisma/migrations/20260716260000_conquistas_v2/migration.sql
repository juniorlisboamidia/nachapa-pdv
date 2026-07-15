-- Conquistas v2: categorias, tipo (única/repetível/progressiva), acumulável, arquivar,
-- níveis por desbloqueio + BACKFILL do catálogo (corrige as existentes e cria as novas).

-- 1) Colunas novas
ALTER TABLE "Conquista"
  ADD COLUMN "categoria"  TEXT NOT NULL DEFAULT 'JORNADA',
  ADD COLUMN "tipo"       TEXT NOT NULL DEFAULT 'UNICA',
  ADD COLUMN "niveisJson" JSONB,
  ADD COLUMN "acumulavel" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "arquivada"  BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "ConquistaDesbloqueada"
  ADD COLUMN "nivel"        INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "motivo"       TEXT,
  ADD COLUMN "concedidoPor" TEXT;

-- Progressiva desbloqueia 1x POR NÍVEL: a unique passa a incluir o nível.
ALTER TABLE "ConquistaDesbloqueada" DROP CONSTRAINT IF EXISTS "ConquistaDesbloqueada_conquistaId_funcionarioId_key";
ALTER TABLE "ConquistaDesbloqueada" ADD CONSTRAINT "ConquistaDesbloqueada_conquistaId_funcionarioId_nivel_key"
  UNIQUE ("conquistaId", "funcionarioId", "nivel");

-- 2) BACKFILL das conquistas existentes (textos, nomes, raridade e categorias novas)
UPDATE "Conquista" SET
  descricao = 'Concluiu seu primeiro ciclo no programa.', categoria = 'JORNADA',
  raridade = 'COMUM', "xpBonus" = 50, regra = 'MESES_ATIVOS', meta = 1, ordem = 0
WHERE nome = 'Primeira Chama';

UPDATE "Conquista" SET
  nome = 'Veterano', descricao = 'Completou seis ciclos no programa.', categoria = 'JORNADA',
  raridade = 'RARO', "xpBonus" = 200, regra = 'MESES_ATIVOS', meta = 6, ordem = 1
WHERE nome = 'Veterano';

UPDATE "Conquista" SET
  nome = 'Assiduidade Perfeita', descricao = 'Concluiu um ciclo com 100% em Assiduidade.',
  categoria = 'ASSIDUIDADE', raridade = 'RARO', "xpBonus" = 100, regra = 'PRESENCA_100', meta = 1, ordem = 2
WHERE nome IN ('Presença Perfeita', 'Assiduidade Perfeita');

UPDATE "Conquista" SET
  descricao = 'Concluiu um ciclo com 100% em Desempenho.', categoria = 'DESEMPENHO',
  raridade = 'RARO', "xpBonus" = 100, regra = 'SCORE_100', meta = 1, ordem = 3
WHERE nome = 'Trabalho Impecável';

UPDATE "Conquista" SET
  descricao = 'Conquistou o 1º lugar no Índice de Excelência pela primeira vez.', categoria = 'EXCELENCIA',
  raridade = 'RARO', "xpBonus" = 150, regra = 'VITORIAS', meta = 1, ordem = 5
WHERE nome = 'Destaque do Mês';

UPDATE "Conquista" SET
  descricao = 'Alcançou o Top 3 em cinco ciclos diferentes.', categoria = 'EXCELENCIA',
  raridade = 'EPICO', "xpBonus" = 200, regra = 'PODIOS', meta = 5, ordem = 6
WHERE nome = 'Pódio Frequente';

-- Tricampeão -> Tripla Coroa
UPDATE "Conquista" SET
  nome = 'Tripla Coroa', descricao = 'Foi Destaque do Mês em três ciclos diferentes.', categoria = 'EXCELENCIA',
  raridade = 'EPICO', "xpBonus" = 300, regra = 'VITORIAS', meta = 3, ordem = 7
WHERE nome IN ('Tricampeão', 'Tripla Coroa');

-- Lenda da Chapa vira COLEÇÃO (não é mais tempo de casa).
UPDATE "Conquista" SET
  descricao = 'Desbloqueou todas as conquistas principais do programa.', categoria = 'COLECAO',
  raridade = 'LENDARIO', "xpBonus" = 500, regra = 'COLECAO', meta = 0, ordem = 11
WHERE nome = 'Lenda da Chapa';

-- 3) Conquistas NOVAS — só para lojas que já têm catálogo (as novas recebem pelo seed).
INSERT INTO "Conquista" ("empresaId", nome, descricao, emoji, raridade, regra, meta, "xpBonus", categoria, tipo, "niveisJson", ativo, ordem, "atualizadoEm")
SELECT e."empresaId", n.nome, n.descricao, n.emoji, n.raridade, n.regra, n.meta, n.coins, n.categoria, n.tipo, n.niveis, true, n.ordem, CURRENT_TIMESTAMP
FROM (SELECT DISTINCT "empresaId" FROM "Conquista") e
CROSS JOIN (VALUES
  ('Consistência em Chamas', 'Finalizou três ciclos consecutivos com Assiduidade e Desempenho acima de 95%.', '📈', 'EPICO', 'CICLOS_CONSECUTIVOS_95', 3, 250, 'EXCELENCIA', 'UNICA', NULL::jsonb, 4),
  ('Ideia em Ação', 'Teve sua primeira sugestão de melhoria implementada pela empresa.', '💡', 'RARO', 'SUGESTOES_IMPLEMENTADAS', 1, 100, 'INOVACAO', 'UNICA', NULL::jsonb, 8),
  ('Olhar de Dono', 'Teve três sugestões de melhoria implementadas.', '🔍', 'EPICO', 'SUGESTOES_IMPLEMENTADAS', 3, 250, 'INOVACAO', 'UNICA', NULL::jsonb, 9),
  ('Parceiro de Time', 'Recebeu reconhecimentos de colegas aprovados pela gestão.', '🤝', 'RARO', 'RECONHECIMENTOS_RECEBIDOS', 5, 150, 'COLABORACAO', 'PROGRESSIVA',
   '[{"nome":"Bronze","meta":5,"coins":150},{"nome":"Prata","meta":15,"coins":250},{"nome":"Ouro","meta":30,"coins":400}]'::jsonb, 10)
) AS n(nome, descricao, emoji, raridade, regra, meta, coins, categoria, tipo, niveis, ordem)
WHERE NOT EXISTS (SELECT 1 FROM "Conquista" c WHERE c."empresaId" = e."empresaId" AND c.nome = n.nome);
