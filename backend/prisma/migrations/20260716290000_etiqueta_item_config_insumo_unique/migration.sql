-- Etiquetas fix: EtiquetaItemConfig.insumoId precisa ser @unique de campo único
-- (não só na composta empresaId+insumoId) porque Insumo.etiquetaConfig é uma
-- relação um-para-um (Prisma exige unique no lado que carrega a FK). Como um
-- Insumo já pertence a uma única empresa, isso não relaxa o isolamento por loja.

DROP INDEX "EtiquetaItemConfig_empresaId_insumoId_key";
CREATE UNIQUE INDEX "EtiquetaItemConfig_insumoId_key" ON "EtiquetaItemConfig"("insumoId");
