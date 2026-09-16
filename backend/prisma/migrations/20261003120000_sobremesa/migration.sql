-- Sobremesas: novo tipo de produto que pode custear por ficha técnica (feita na casa)
-- ou por custo direto (comprada pronta). Aditivo: nenhum dado existente é alterado.
ALTER TABLE "Produto" ADD COLUMN "sobremesaModo" TEXT;
