// Árvore da sidebar (3 níveis) + filtro por área + localização da rota. Puro, sem React,
// pra ser testado com node --test. A ORDEM aqui é a fonte de verdade (spec §1).
// Nó: { label, icon | iconImg, to?, area?, itens? }. Com `itens` = drill; com `to` = link.
// `area` pode estar em qualquer nível; filho sem `area` herda a do pai.
export const grupos = [
  {
    label: 'Relatórios', icon: 'relatorios', area: 'relatorios',
    itens: [
      { to: '/relatorios/meta', label: 'Meta Ads', iconImg: '/meta-ads.svg' },
      { to: '/relatorios/instagram', label: 'Instagram', iconImg: '/instagram.svg' },
      { to: '/relatorios/google', label: 'Google Ads', iconImg: '/google-ads.svg' },
      { to: '/relatorios/cardapio', label: 'Cardápio', iconImg: '/cardapio-web.webp' },
      { to: '/relatorios/gmn', label: 'Google Meu Negócio', icon: 'relatorios' },
    ],
  },
  {
    label: 'Produtos', icon: 'produtos', area: 'produtos',
    itens: [
      { to: '/produtos', label: 'Ficha técnica', icon: 'ficha' },
      { to: '/insumos', label: 'Insumos', icon: 'insumos' },
      { to: '/estoque', label: 'Estoque', icon: 'analise' },
      { to: '/fornecedores', label: 'Fornecedores', icon: 'empresa' },
    ],
  },
  {
    label: 'Gestão', icon: 'gestao', area: 'gestao',
    itens: [
      { to: '/faturamento', label: 'Faturamento', icon: 'faturamento' },
      { to: '/custos', label: 'Custos', icon: 'custos' },
    ],
  },
  {
    label: 'Marketing', icon: 'marketing', area: 'marketing',
    itens: [
      { to: '/marketing/grupo-vip', label: 'Grupo VIP', icon: 'marketing' },
      {
        label: 'Avaliador', icon: 'avaliacao',
        itens: [
          { to: '/avaliacoes', label: 'Avaliação', icon: 'avaliacao' },
          { to: '/clientes', label: 'Clientes', icon: 'clientes' },
          { to: '/respostas', label: 'Respostas', icon: 'relatorios' },
        ],
      },
      {
        label: 'Indicação', icon: 'marketing',
        itens: [
          { to: '/indicacao', label: 'Painel Geral', icon: 'dashboard', end: true },
          { to: '/indicacao/personalizacao', label: 'Personalização', icon: 'gestao' },
          { to: '/indicacao/promotores', label: 'Promotores', icon: 'clientes' },
          { to: '/indicacao/recompensas', label: 'Recompensas', icon: 'avaliacao' },
          { to: '/indicacao/indicacoes', label: 'Indicações', icon: 'marketing' },
          { to: '/indicacao/cupons', label: 'Cupons', icon: 'faturamento' },
        ],
      },
    ],
  },
  {
    label: 'Dep. Pessoal', icon: 'clientes',
    itens: [
      { to: '/rh/colaboradores', label: 'Colaboradores', icon: 'entregadores', area: 'ponto' },
      {
        label: 'Ponto Facial', icon: 'ponto', area: 'ponto',
        itens: [
          { to: '/rh/ponto-facial/painel', label: 'Painel', icon: 'ponto' },
          { to: '/rh/ponto-facial/jornadas', label: 'Jornadas e Escalas', icon: 'calendario' },
          { to: '/rh/ponto-facial/afastamentos', label: 'Afastamentos', icon: 'calendario' },
          { to: '/rh/ponto-facial/marcacoes', label: 'Marcações', icon: 'ponto' },
          { to: '/rh/ponto-facial/espelho', label: 'Espelho', icon: 'ficha' },
          { to: '/rh/ponto-facial/fechamento', label: 'Fechamento', icon: 'custos' },
          { to: '/rh/ponto-facial/coletor', label: 'Coletor', icon: 'ponto' },
        ],
      },
      {
        label: 'Motoboys', icon: 'moto', area: 'motoboys',
        itens: [
          { to: '/escala-motoboys', label: 'Escala', icon: 'calendario' },
          { to: '/entregadores', label: 'Entregadores', icon: 'entregadores' },
          { to: '/calc-frete', label: 'Calc. Frete', icon: 'moto' },
          { to: '/motoboys/config', label: 'Configuração', icon: 'config' },
        ],
      },
      {
        label: 'Bonificação', icon: 'faturamento', area: 'bonificacao',
        itens: [
          { to: '/rh/bonificacao/mes', label: 'Mês atual', icon: 'calendario' },
          { to: '/rh/bonificacao/equipe', label: 'Equipe & Coins', icon: 'clientes' },
          { to: '/rh/bonificacao/conquistas', label: 'Conquistas', icon: 'avaliacao' },
          { to: '/rh/bonificacao/mercado', label: 'Mercado', icon: 'produtos' },
          { to: '/rh/bonificacao/config', label: 'Configuração', icon: 'gestao' },
        ],
      },
      {
        label: 'Banco de talentos', icon: 'clientes', area: 'talentos',
        itens: [
          { to: '/rh/banco-de-talentos/banco', label: 'Cadastros', icon: 'clientes' },
          { to: '/rh/banco-de-talentos/vagas', label: 'Vagas abertas', icon: 'ficha' },
          { to: '/rh/banco-de-talentos/formulario', label: 'Formulário permanente', icon: 'ficha' },
        ],
      },
    ],
  },
  {
    label: 'Ferramentas', icon: 'gestao',
    itens: [
      {
        label: 'Checklist', icon: 'ficha', area: 'checklist',
        itens: [
          { to: '/checklist/painel', label: 'Painel', icon: 'gestao' },
          { to: '/checklist/checklists', label: 'Checklists', icon: 'ficha' },
          { to: '/checklist/templates', label: 'Templates', icon: 'produtos' },
          { to: '/checklist/notificacoes', label: 'Notificações', icon: 'marketing' },
          { to: '/checklist/configuracoes', label: 'Configurações', icon: 'gestao' },
        ],
      },
      {
        label: 'Etiquetas', icon: 'ficha', area: 'etiquetas',
        itens: [
          { to: '/etiquetas/config', label: 'Configuração', icon: 'gestao' },
          { to: '/etiquetas/itens', label: 'Itens', icon: 'ficha' },
          { to: '/etiquetas/historico', label: 'Histórico', icon: 'relatorios' },
        ],
      },
    ],
  },
];

// Filtro recursivo: nó com `area` só aparece se o operador a tiver; nó sem `area` herda a
// do pai; grupo/subgrupo só aparece se sobrar ≥1 filho. ADMIN vê tudo.
function filtrarNos(nos, areas, areaPai) {
  const out = [];
  for (const n of nos) {
    const area = n.area ?? areaPai;
    if (area && !areas.has(area)) continue;
    if (n.itens) {
      const filhos = filtrarNos(n.itens, areas, area);
      if (filhos.length) out.push({ ...n, itens: filhos });
    } else {
      out.push(n);
    }
  }
  return out;
}

export function gruposVisiveis(usuario) {
  if (!usuario || usuario.tipo !== 'operador') return grupos;
  return filtrarNos(grupos, new Set(usuario.areas || []), null);
}

// Casa a rota atual e devolve { grupo, sub } para abrir a sidebar já no nível certo.
const matchLeaf = (it, pathname) => it.to && (it.to === '/' ? pathname === '/' : pathname === it.to || pathname.startsWith(it.to + '/'));
export function localizarRota(pathname) {
  for (const g of grupos) {
    if (!g.itens) continue;
    for (const it of g.itens) {
      if (it.itens) {
        if (it.itens.some((sub) => matchLeaf(sub, pathname))) return { grupo: g.label, sub: it.label };
      } else if (matchLeaf(it, pathname)) {
        return { grupo: g.label, sub: null };
      }
    }
  }
  return { grupo: null, sub: null };
}
