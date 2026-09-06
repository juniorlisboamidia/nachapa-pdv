-- Faixas (ideal/atenção/acima) dos Tempos operacionais do Cardápio, configuráveis por loja.
-- Portado do H360 (20260816120000_tempo_faixa_cardapio).
CREATE TABLE "TempoFaixaCardapioConfig" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "preparoIdeal" INTEGER NOT NULL DEFAULT 25,
    "preparoAtencao" INTEGER NOT NULL DEFAULT 40,
    "entregaIdeal" INTEGER NOT NULL DEFAULT 20,
    "entregaAtencao" INTEGER NOT NULL DEFAULT 35,
    "totalIdeal" INTEGER NOT NULL DEFAULT 45,
    "totalAtencao" INTEGER NOT NULL DEFAULT 70,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TempoFaixaCardapioConfig_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TempoFaixaCardapioConfig_empresaId_key" ON "TempoFaixaCardapioConfig"("empresaId");
