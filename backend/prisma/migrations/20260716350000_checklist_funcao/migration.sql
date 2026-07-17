-- Checklist passa a ser atribuido por FUNCAO (reusa a Funcao existente — Aux. de Cozinha,
-- Atendente, Caixa, Gerente, Entregador), nao mais por Setor. O colaborador ja tem a sua
-- funcao no cadastro (Ponto Facial); o casamento e por nome. Some o conceito de Setor.

-- Checklist: nomes das funcoes que executam (substitui setorIds).
ALTER TABLE "Checklist" ADD COLUMN "funcoes" TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE "Checklist" DROP COLUMN "setorIds";

-- Funcionario: nao usa mais setorIds (a funcao dele ja e a String "funcao").
ALTER TABLE "Funcionario" DROP COLUMN "setorIds";

-- Setor deixa de existir (nunca teve FK apontando pra ele — setorIds era Int[] solto).
DROP TABLE "Setor";
