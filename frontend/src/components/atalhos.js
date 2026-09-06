// Lógica pura da Visão Geral (painel de atalhos): gera os atalhos a partir da MESMA árvore da
// sidebar (sidebarNav.js) e cuida dos favoritos ("Mais usados") do usuário. Sem React, sem
// DOM — testável com node --test (atalhos.test.js).

// Primeira rota alcançável a partir de um nó: folha devolve o próprio `to`; subgrupo desce
// em profundidade até a primeira folha (ex.: Ponto Facial → Painel).
export function primeiraFolha(no) {
  if (!no) return null;
  if (no.to) return no.to;
  for (const filho of (no.itens || [])) {
    const to = primeiraFolha(filho);
    if (to) return to;
  }
  return null;
}

// Uma seção por grupo raiz que tenha `itens` (grupo-link direto não vira seção); um card por
// nó de 2º nível, carregando o mesmo ícone/logo da sidebar. O filtro por área do operador já
// veio de fora (gruposVisiveis) — aqui só se projeta.
export function atalhosDaArvore(grupos) {
  const secoes = [];
  for (const g of (grupos || [])) {
    if (!Array.isArray(g.itens) || !g.itens.length) continue;
    const itens = [];
    for (const it of g.itens) {
      const to = primeiraFolha(it);
      if (!to) continue;
      itens.push({ to, label: it.label, icon: it.icon, iconImg: it.iconImg, grupo: g.label });
    }
    if (itens.length) secoes.push({ titulo: g.label, itens });
  }
  return secoes;
}

export const MAX_FAVORITOS = 6;

// Chave do localStorage: por LOJA e por USUÁRIO (tipo + id), pra dois gerentes no mesmo PC não
// dividirem favoritos. Sem id conhecido cai em "anon".
export function chaveFavoritos(usuario, lojaId) {
  const tipo = usuario?.tipo || 'anon';
  const id = usuario?.id ?? 'anon';
  return `hb-favoritos:${lojaId ?? 'loja'}:${tipo}:${id}`;
}

// Fixa/desafixa. Ao tentar fixar além do limite devolve a lista intacta e `cheio: true`
// (a tela avisa); desafixar sempre passa.
export function alternarFavorito(lista, to, max = MAX_FAVORITOS) {
  const atual = Array.isArray(lista) ? lista : [];
  if (atual.includes(to)) return { lista: atual.filter((x) => x !== to), cheio: false };
  if (atual.length >= max) return { lista: atual, cheio: true };
  return { lista: [...atual, to], cheio: false };
}

// Só o que existe na árvore visível aparece (rota removida ou área que o operador perdeu é
// ignorada na exibição — o storage não é apagado, pode voltar). Mantém a ordem de fixação.
export function favoritosValidos(lista, secoes) {
  const existentes = new Set((secoes || []).flatMap((s) => s.itens.map((i) => i.to)));
  return (Array.isArray(lista) ? lista : []).filter((to) => existentes.has(to));
}

// localStorage pode não existir, estar bloqueado ou guardar lixo: ler devolve [] e gravar
// nunca lança — favoritos são conveniência, não podem derrubar a tela inicial.
export function lerFavoritos(storage, chave) {
  try {
    const v = JSON.parse(storage?.getItem(chave) || '[]');
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
  } catch { return []; }
}
export function gravarFavoritos(storage, chave, lista) {
  try { storage?.setItem(chave, JSON.stringify(lista)); } catch { /* sem persistência: segue só em memória */ }
}
