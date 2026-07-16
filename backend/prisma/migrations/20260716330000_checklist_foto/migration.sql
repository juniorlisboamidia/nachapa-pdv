CREATE TABLE "ChecklistFoto" (
  "id" SERIAL PRIMARY KEY, "empresaId" INTEGER NOT NULL, "execucaoId" INTEGER NOT NULL,
  "itemChave" TEXT NOT NULL, "dataUrl" TEXT NOT NULL, "largura" INTEGER, "altura" INTEGER,
  "tamanhoBytes" INTEGER, "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ChecklistFoto_execucaoId_fkey" FOREIGN KEY ("execucaoId") REFERENCES "ChecklistExecucao"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ChecklistFoto_execucaoId_itemChave_key" ON "ChecklistFoto"("execucaoId","itemChave");
CREATE INDEX "ChecklistFoto_empresaId_idx" ON "ChecklistFoto"("empresaId");

-- Backfill: os itens de foto que a Fatia 1 tirou dos templates voltam aos templates
-- JÁ semeados (lojas novas recebem pelo seed atualizado). Casa por nome+categoria,
-- anexa ao fim (ordem = max+1) e é idempotente (NOT EXISTS pelo título).
INSERT INTO "ChecklistTemplateItem" ("empresaId","templateId","ordem","tipo","titulo","descricao","critico","config")
SELECT t."empresaId", t."id",
  (SELECT COALESCE(MAX(i2."ordem"),-1)+1 FROM "ChecklistTemplateItem" i2 WHERE i2."templateId"=t."id"),
  'FOTO'::"TipoItemChecklist", f.titulo, f.descricao, f.critico, NULL
FROM "ChecklistTemplate" t
JOIN (VALUES
  ('Abertura Cozinha','Abertura','Foto da organização geral','Verifique se a cozinha está organizada, limpa e sem resíduos',false),
  ('Abertura Salão','Abertura','Foto do salão montado','Verifique se as mesas estão arrumadas e o ambiente apresentável',false),
  ('Fechamento Cozinha','Fechamento','Foto da válvula de gás desligada','Verifique se a válvula de gás está na posição FECHADA',true),
  ('Fechamento Cozinha','Fechamento','Foto do estado final da cozinha','Verifique se os equipamentos estão desligados e a cozinha limpa',false),
  ('Controle de Pragas','Controle de Pragas','Foto das armadilhas','Verifique se as armadilhas estão intactas e posicionadas',false),
  ('Segurança Alimentar','Segurança Alimentar','Foto das etiquetas de validade','Verifique se as etiquetas estão visíveis e dentro do prazo',false)
) AS f(tnome,tcat,titulo,descricao,critico)
  ON t."nome"=f.tnome AND t."categoria"=f.tcat
WHERE NOT EXISTS (
  SELECT 1 FROM "ChecklistTemplateItem" i3 WHERE i3."templateId"=t."id" AND i3."titulo"=f.titulo
);
