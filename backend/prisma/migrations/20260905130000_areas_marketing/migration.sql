-- Sidebar repaginada: a área 'automacoes' vira 'marketing' e 'financeiro' deixa de existir.
-- Sem isto os gerentes perderiam o Grupo VIP em silêncio (gate fail-closed).
UPDATE "AcessoOperador" SET "areas" = array_replace("areas", 'automacoes', 'marketing') WHERE 'automacoes' = ANY("areas");
UPDATE "AcessoOperador" SET "areas" = array_remove("areas", 'financeiro') WHERE 'financeiro' = ANY("areas");
