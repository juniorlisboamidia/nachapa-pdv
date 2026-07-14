-- Folga fixa por colaborador (dias 0=dom..6=sáb). Sobrepõe a folga da jornada;
-- vazio = usa só a jornada (retrocompatível).
ALTER TABLE "Funcionario" ADD COLUMN "folgaSemana" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[];
