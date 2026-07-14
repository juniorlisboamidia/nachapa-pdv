-- Ocorrências COLETIVAS (da loja/equipe) não têm funcionário: funcionarioId vira opcional.
ALTER TABLE "BonificacaoOcorrencia" ALTER COLUMN "funcionarioId" DROP NOT NULL;
