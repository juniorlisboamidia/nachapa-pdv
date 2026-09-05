// Propagação do custo em cascata (Produtos › Insumos).
//
// O custo de um insumo PRODUCAO_PROPRIA é PERSISTIDO em Insumo.custoUnitario —
// é ele que as fichas técnicas e os combos leem. Quando o custo de um
// ingrediente muda, toda receita que o usa fica com o valor velho.
//
// Esta função responde APENAS "em que ordem recalcular": ordenação topológica
// do subgrafo alcançável a partir do insumo alterado. Um insumo só é
// recalculado depois de TODOS os ingredientes dele que também mudaram — senão
// a receita de cima somaria um custo velho.
//
// Hoje o cadastro proíbe receita dentro de receita (POST .../receita/itens
// recusa ingrediente PRODUCAO_PROPRIA), então na prática o grafo tem um nível
// só. A ordenação existe porque a checagem é da rota, não do banco: cadastro
// legado ou um dia em que a regra caia não podem gerar custo errado nem laço
// infinito.
//
// Sem banco aqui de propósito: é a parte que dá para testar sozinha.

/**
 * @param {number} raizId insumo cujo custo acabou de mudar
 * @param {Map<number, number[]>} consumidoresPorInsumo insumoId → ids dos
 *   insumos de produção própria que o usam como ingrediente
 * @returns {number[]} insumos a recalcular, em ordem segura (sem a raiz, sem repetição)
 */
export function ordemDeRecalculo(raizId, consumidoresPorInsumo) {
  const consumidoresDe = (id) => consumidoresPorInsumo.get(id) ?? [];

  // 1) Quem é afetado (BFS a partir da raiz). A ordem de descoberta também é o
  //    desempate estável e o plano B para ciclos.
  const alcancados = new Set([raizId]);
  const descobertos = [];
  const fila = [raizId];
  while (fila.length > 0) {
    for (const consumidorId of consumidoresDe(fila.shift())) {
      if (alcancados.has(consumidorId)) continue;
      alcancados.add(consumidorId);
      descobertos.push(consumidorId);
      fila.push(consumidorId);
    }
  }

  // 2) Grau de entrada dentro do subgrafo afetado.
  const grauEntrada = new Map(descobertos.map((id) => [id, 0]));
  for (const id of alcancados) {
    for (const consumidorId of consumidoresDe(id)) {
      if (grauEntrada.has(consumidorId)) grauEntrada.set(consumidorId, grauEntrada.get(consumidorId) + 1);
    }
  }

  // 3) Kahn, partindo da raiz (já recalculada por quem chamou).
  const ordem = [];
  const prontos = consumidoresDe(raizId).filter((id) => grauEntrada.get(id) === 1);
  for (const id of prontos) grauEntrada.set(id, 0);
  const pendentes = [raizId, ...prontos];
  const emitidos = new Set();
  while (pendentes.length > 0) {
    const id = pendentes.shift();
    if (id !== raizId) {
      if (emitidos.has(id)) continue;
      emitidos.add(id);
      ordem.push(id);
    }
    for (const consumidorId of consumidoresDe(id)) {
      if (!grauEntrada.has(consumidorId) || emitidos.has(consumidorId)) continue;
      const restante = grauEntrada.get(consumidorId) - 1;
      grauEntrada.set(consumidorId, restante);
      if (restante <= 0) pendentes.push(consumidorId);
    }
  }

  // 4) Ciclo entre receitas (cadastro inválido, mas não pode travar a tela):
  //    quem sobrou entra na ordem em que foi descoberto.
  for (const id of descobertos) {
    if (!emitidos.has(id)) {
      emitidos.add(id);
      ordem.push(id);
    }
  }

  return ordem;
}
