-- Atribuicao dupla do checklist: por FUNCAO (como hoje) OU por COLABORADOR (pessoas
-- especificas, para responsabilidade clara). Aditivo — checklists existentes seguem FUNCAO.
ALTER TABLE "Checklist" ADD COLUMN "atribuicaoTipo" TEXT NOT NULL DEFAULT 'FUNCAO';
ALTER TABLE "Checklist" ADD COLUMN "funcionarioIds" INTEGER[] NOT NULL DEFAULT '{}';
