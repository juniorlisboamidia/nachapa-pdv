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

// Nome da constraint do @unique de `lote` no Postgres (padrão do Prisma:
// <Tabela>_<coluna>_key). É o identificador que o driver devolve quando a
// unicidade estoura — ver colisaoDeLote().
//
// Este literal é a ÚNICA amarra entre o retry e o banco, e nada no schema o
// protege: um rename do model ou da coluna faria o Postgres mandar outro nome e o
// retry viraria código morto de novo, calado. Por isso o teste deste módulo lê o
// schema.prisma e confere que ele continua batendo — o rename quebra o teste em
// vez de quebrar a cozinha.
export const CONSTRAINT_LOTE = 'EtiquetaImpressa_lote_key';

// O create do lote só pode reciclar UM erro: a colisão do @unique de `lote`.
// Identificar isso é mais chato do que parece e já falhou uma vez aqui:
//
//   - `meta.target`, o caminho "óbvio", vem VAZIO neste stack (Prisma 7 + adapter
//     pg): a mensagem é literalmente "Unique constraint failed on the (not
//     available)". Um check só por target nunca casa e o retry vira código morto —
//     era exatamente o bug desta função na primeira versão.
//   - A evidência real está no erro do driver, que traz o NOME da constraint. É por
//     ele que casamos, nunca pela prosa: o Postgres devolve originalMessage no
//     locale do servidor (aqui vem em português) e o identificador é estável.
//
// Vive aqui, no módulo puro, porque é lógica de decisão sem Prisma nenhum: recebe o
// objeto de erro e responde sim/não. Era em server.js que ela morreu calada sem
// ninguém notar — sem teste, o ramo que importa nunca rodava.
//
// `target` continua sendo testado primeiro porque é o contrato oficial do Prisma:
// se uma versão futura voltar a preenchê-lo, casa por ele e o ramo do driver nem roda.
export function colisaoDeLote(e) {
  if (e?.code !== 'P2002') return false; // P2002 = violação de unicidade
  const alvo = e?.meta?.target;
  if (alvo) return Array.isArray(alvo) ? alvo.includes('lote') : String(alvo).includes('lote');
  const original = e?.meta?.driverAdapterError?.cause?.originalMessage;
  if (original) return original.includes(CONSTRAINT_LOTE);
  // Sem evidência nenhuma: `lote` é hoje o ÚNICO unique de EtiquetaImpressa (os
  // @@index não são únicos), então um P2002 neste create só pode ser ele. Se um dia
  // outro unique entrar no model, os dois ramos acima já separam os casos — este
  // fallback existe para o retry não morrer calado de novo se o formato do erro mudar.
  return true;
}
