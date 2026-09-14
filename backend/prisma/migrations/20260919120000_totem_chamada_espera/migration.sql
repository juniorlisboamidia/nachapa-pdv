-- Totem: o texto do botão da tela de espera. Aditiva e anulável.
--
-- NULL não é ausência de dado, é uma escolha: significa "sem personalização, use o padrão"
-- (Toque para começar). Por isso a coluna não tem DEFAULT — um default no banco faria a
-- string do padrão existir em dois lugares, e mudar o texto padrão passaria a exigir
-- migration em vez de uma linha de código.
ALTER TABLE "TotemConfiguracao" ADD COLUMN "chamadaEspera" TEXT;
