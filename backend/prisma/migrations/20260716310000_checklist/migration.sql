-- Checklist Inteligente (Fatia 1). Sem seed aqui — os templates são semeados
-- em JS na primeira leitura (cobre lojas criadas depois).

CREATE TYPE "TipoItemChecklist" AS ENUM ('CHECK','AVALIACAO','TEXTO','NUMERICO','SELECAO');
CREATE TYPE "PrioridadeChecklist" AS ENUM ('BAIXA','MEDIA','ALTA');
CREATE TYPE "RecorrenciaTipo" AS ENUM ('DIARIA','DIAS_SEMANA','AVULSO');
CREATE TYPE "StatusExecucao" AS ENUM ('EM_ANDAMENTO','CONCLUIDA');

ALTER TABLE "Funcionario" ADD COLUMN "setorIds" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[];

CREATE TABLE "Setor" (
  "id" SERIAL PRIMARY KEY, "empresaId" INTEGER NOT NULL, "nome" TEXT NOT NULL,
  "ordem" INTEGER NOT NULL DEFAULT 0, "ativo" BOOLEAN NOT NULL DEFAULT true,
  "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizadoEm" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "Setor_empresaId_nome_key" ON "Setor"("empresaId","nome");
CREATE INDEX "Setor_empresaId_idx" ON "Setor"("empresaId");

CREATE TABLE "ChecklistTemplate" (
  "id" SERIAL PRIMARY KEY, "empresaId" INTEGER NOT NULL, "nome" TEXT NOT NULL,
  "categoria" TEXT NOT NULL, "descricao" TEXT, "tempoEstimadoMin" INTEGER,
  "ativo" BOOLEAN NOT NULL DEFAULT true, "arquivado" BOOLEAN NOT NULL DEFAULT false,
  "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "atualizadoEm" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "ChecklistTemplate_empresaId_idx" ON "ChecklistTemplate"("empresaId");

CREATE TABLE "ChecklistTemplateItem" (
  "id" SERIAL PRIMARY KEY, "empresaId" INTEGER NOT NULL, "templateId" INTEGER NOT NULL,
  "ordem" INTEGER NOT NULL DEFAULT 0, "tipo" "TipoItemChecklist" NOT NULL, "titulo" TEXT NOT NULL,
  "descricao" TEXT, "critico" BOOLEAN NOT NULL DEFAULT false, "config" JSONB,
  CONSTRAINT "ChecklistTemplateItem_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ChecklistTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "ChecklistTemplateItem_empresaId_idx" ON "ChecklistTemplateItem"("empresaId");
CREATE INDEX "ChecklistTemplateItem_templateId_idx" ON "ChecklistTemplateItem"("templateId");

CREATE TABLE "Checklist" (
  "id" SERIAL PRIMARY KEY, "empresaId" INTEGER NOT NULL, "templateOrigemId" INTEGER,
  "nome" TEXT NOT NULL, "categoria" TEXT NOT NULL, "descricao" TEXT,
  "prioridade" "PrioridadeChecklist" NOT NULL DEFAULT 'MEDIA',
  "setorIds" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
  "recorrenciaTipo" "RecorrenciaTipo" NOT NULL DEFAULT 'AVULSO', "recorrenciaConfig" JSONB,
  "ativo" BOOLEAN NOT NULL DEFAULT true,
  "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "atualizadoEm" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "Checklist_empresaId_idx" ON "Checklist"("empresaId");

CREATE TABLE "ChecklistItem" (
  "id" SERIAL PRIMARY KEY, "empresaId" INTEGER NOT NULL, "checklistId" INTEGER NOT NULL,
  "ordem" INTEGER NOT NULL DEFAULT 0, "tipo" "TipoItemChecklist" NOT NULL, "titulo" TEXT NOT NULL,
  "descricao" TEXT, "critico" BOOLEAN NOT NULL DEFAULT false, "config" JSONB,
  CONSTRAINT "ChecklistItem_checklistId_fkey" FOREIGN KEY ("checklistId") REFERENCES "Checklist"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "ChecklistItem_empresaId_idx" ON "ChecklistItem"("empresaId");
CREATE INDEX "ChecklistItem_checklistId_idx" ON "ChecklistItem"("checklistId");

CREATE TABLE "ChecklistExecucao" (
  "id" SERIAL PRIMARY KEY, "empresaId" INTEGER NOT NULL, "checklistId" INTEGER NOT NULL,
  "dataRef" TIMESTAMP(3) NOT NULL, "funcionarioId" INTEGER NOT NULL,
  "iniciadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "concluidaEm" TIMESTAMP(3),
  "status" "StatusExecucao" NOT NULL DEFAULT 'EM_ANDAMENTO', "emAlerta" BOOLEAN NOT NULL DEFAULT false,
  "itensSnapshotJson" JSONB NOT NULL,
  CONSTRAINT "ChecklistExecucao_checklistId_fkey" FOREIGN KEY ("checklistId") REFERENCES "Checklist"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ChecklistExecucao_checklistId_dataRef_key" ON "ChecklistExecucao"("checklistId","dataRef");
CREATE INDEX "ChecklistExecucao_empresaId_dataRef_idx" ON "ChecklistExecucao"("empresaId","dataRef");

CREATE TABLE "ChecklistResposta" (
  "id" SERIAL PRIMARY KEY, "empresaId" INTEGER NOT NULL, "execucaoId" INTEGER NOT NULL,
  "itemChave" TEXT NOT NULL, "tipo" "TipoItemChecklist" NOT NULL, "valorJson" JSONB,
  "conforme" BOOLEAN, "observacao" TEXT, "atualizadoEm" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ChecklistResposta_execucaoId_fkey" FOREIGN KEY ("execucaoId") REFERENCES "ChecklistExecucao"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ChecklistResposta_execucaoId_itemChave_key" ON "ChecklistResposta"("execucaoId","itemChave");
CREATE INDEX "ChecklistResposta_empresaId_idx" ON "ChecklistResposta"("empresaId");
