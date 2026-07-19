-- Conservações de etiqueta: remove Resfriado (4-6 °C) e Descongelado das OPÇÕES, e muda
-- o Refrigerado (RESFRIADO_0_4) para 0 a 8 °C. É migração de DADOS: o enum ConservacaoTipo
-- mantém RESFRIADO_4_6/DESCONGELADO (etiquetas antigas no histórico ainda têm esses valores
-- e precisam exibir) — só deixamos de oferecê-los como regra/opção.

-- Remove as regras dessas duas conservações (some das opções no quiosque, na Config e no admin).
DELETE FROM "EtiquetaRegra" WHERE "conservacao" IN ('RESFRIADO_4_6', 'DESCONGELADO');

-- Refrigerado passa de "0 a 4 °C" para "0 a 8 °C".
UPDATE "EtiquetaRegra" SET "tempLabel" = '0 a 8 °C' WHERE "conservacao" = 'RESFRIADO_0_4';

-- Itens (EtiquetaItemConfig) que tinham as conservações removidas como padrão perdem o
-- padrão (voltam a exigir escolha / a regra da conservação selecionada).
UPDATE "EtiquetaItemConfig" SET "conservacaoPadrao" = NULL WHERE "conservacaoPadrao" IN ('RESFRIADO_4_6', 'DESCONGELADO');
