// Regra de validade e lote das Etiquetas (ANVISA RDC 216/2004).
// Módulo puro: sem Prisma, sem Express — é o que decide a data que vai colada
// no alimento, então é o que tem teste.

export const CONSERVACOES = ['CONGELADO', 'RESFRIADO_0_4', 'RESFRIADO_4_6', 'AMBIENTE', 'DESCONGELADO', 'ABERTO'];

const DIA_MS = 24 * 60 * 60 * 1000;

// Validade = manipulação + N dias. N vem do item (se ele tem validade própria)
// ou da regra da conservação. Somamos em ms sobre o instante: o horário de
// parede se preserva e não dependemos do fuso do processo (o VPS roda em UTC).
export function validadeDe({ manipuladoEmMs, conservacao, regras, itemConfig }) {
  if (!CONSERVACOES.includes(conservacao)) throw { http: 400, msg: 'Conservação inválida.' };
  const regra = (regras || []).find((r) => r.conservacao === conservacao);
  if (!regra) throw { http: 400, msg: 'Não há regra de validade para esta conservação.' };

  const diasItem = itemConfig?.validadeDias;
  // > 0 é de propósito: 0 ou negativo faria a etiqueta nascer vencida, então
  // ignora a validade do item e cai na regra da conservação em vez disso.
  const usaItem = Number.isFinite(diasItem) && diasItem > 0;
  const dias = usaItem ? diasItem : regra.dias;

  return {
    validoAte: new Date(manipuladoEmMs + dias * DIA_MS),
    dias,
    origem: usaItem ? 'ITEM' : 'REGRA',
    tempLabel: regra.tempLabel,
  };
}

// Alfabeto sem ambíguos (I/O/0/1): o lote é lido em voz alta e digitado por
// gente com a mão ocupada.
const ALFA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function gerarLote() {
  let s = '';
  for (let i = 0; i < 6; i++) s += ALFA[Math.floor(Math.random() * ALFA.length)];
  return s;
}
