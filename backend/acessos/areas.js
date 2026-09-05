// Permissão por área (só operadores; ADMIN vê tudo). Mapa PREFIXO de rota da API → área.
// FAIL-CLOSED: rota não mapeada = negada (o middleware em server.js trata). Resolve pelo
// prefixo MAIS LONGO que casar, pra um prefixo curto nunca engolir um mais específico.
// Chaves (fonte de verdade da sanitização em /api/acessos): ver spec §2.
export const AREAS_DISPONIVEIS = ['relatorios', 'produtos', 'gestao', 'marketing', 'ponto', 'motoboys', 'bonificacao', 'talentos', 'checklist', 'etiquetas'];

export const AREA_PREFIXOS = [
  ['/relatorios', 'relatorios'], ['/dashboard', 'relatorios'],
  ['/produtos', 'produtos'], ['/insumos', 'produtos'], ['/estoque', 'produtos'], ['/ficha-tecnica', 'produtos'], ['/fichas', 'produtos'],
  ['/fornecedores', 'produtos'], ['/fornecedor-insumo', 'produtos'], ['/cmv', 'produtos'],
  ['/custos', 'gestao'], ['/faturamento', 'gestao'], ['/ponto-equilibrio', 'gestao'],
  ['/grupo-vip', 'marketing'], ['/automacoes', 'marketing'], ['/avaliacao', 'marketing'], ['/indicacao', 'marketing'],
  ['/funcionarios', 'ponto'], ['/ponto', 'ponto'], ['/jornadas', 'ponto'], ['/funcoes', 'ponto'], ['/dispositivos', 'ponto'], ['/coletor', 'ponto'],
  ['/motoboys', 'motoboys'], ['/escala-motoboys', 'motoboys'],
  ['/bonificacao', 'bonificacao'],
  ['/candidatos', 'talentos'], ['/vagas', 'talentos'], ['/recrutamento', 'talentos'], ['/talentos', 'talentos'], ['/banco-talentos', 'talentos'],
  ['/checklist', 'checklist'], ['/etiquetas', 'etiquetas'],
];

// Mais longo primeiro (mesma ideia de acessos/modulos.js do H360).
const ORDENADOS = [...AREA_PREFIXOS].sort((a, b) => b[0].length - a[0].length);

export function areaDoPath(path) {
  for (const [pre, area] of ORDENADOS) {
    if (path === pre || path.startsWith(pre + '/')) return area;
  }
  return null;
}
