// Árvore da sidebar (3 níveis) + filtro por área + localização da rota. Puro, sem React,
// pra ser testado com node --test. A ORDEM aqui é a fonte de verdade (spec §1).
// Nó: { label, icon | iconImg, to?, area?, itens? }. Com `itens` = drill; com `to` = link.
// `area` pode estar em qualquer nível; filho sem `area` herda a do pai.
export const grupos = [
  {
    label: 'Relatórios', icon: 'chartColumn', area: 'relatorios',
    itens: [
      { to: '/relatorios/meta', label: 'Meta Ads', iconImg: '/meta-ads.svg' },
      { to: '/relatorios/instagram', label: 'Instagram', iconImg: '/instagram.svg' },
      { to: '/relatorios/google', label: 'Google Ads', iconImg: '/google-ads.svg' },
      { to: '/relatorios/cardapio', label: 'Cardápio', iconImg: '/cardapio-web.webp' },
      { to: '/relatorios/gmn', label: 'Google Meu Negócio', icon: 'relatorios' },
    ],
  },
  {
    label: 'Produtos', icon: 'package', area: 'produtos',
    itens: [
      { to: '/produtos', label: 'Ficha técnica', icon: 'clipboardList' },
      { to: '/insumos', label: 'Insumos', icon: 'boxes' },
      { to: '/estoque', label: 'Estoque', icon: 'warehouse' },
      { to: '/fornecedores', label: 'Fornecedores', icon: 'truck' },
    ],
  },
  {
    label: 'Gestão', icon: 'building', area: 'gestao',
    itens: [
      { to: '/faturamento', label: 'Faturamento', icon: 'faturamento' },
      { to: '/custos', label: 'Custos', icon: 'custos' },
    ],
  },
  {
    label: 'Marketing', icon: 'megaphone', area: 'marketing',
    itens: [
      { to: '/marketing/grupo-vip', label: 'Grupo VIP', icon: 'crown' },
      {
        label: 'Avaliador', icon: 'star',
        itens: [
          { to: '/avaliacoes', label: 'Avaliação', icon: 'avaliacao' },
          { to: '/clientes', label: 'Clientes', icon: 'clientes' },
          { to: '/respostas', label: 'Respostas', icon: 'relatorios' },
        ],
      },
      {
        label: 'Indicação', icon: 'userRoundPlus',
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
    label: 'Dep. Pessoal', icon: 'users',
    itens: [
      { to: '/rh/colaboradores', label: 'Colaboradores', icon: 'usersRound', area: 'ponto' },
      {
        label: 'Ponto Facial', icon: 'scanFace', area: 'ponto',
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
        label: 'Motoboys', icon: 'bike', area: 'motoboys',
        itens: [
          { to: '/escala-motoboys', label: 'Escala', icon: 'calendario' },
          { to: '/entregadores', label: 'Entregadores', icon: 'entregadores' },
          { to: '/calc-frete', label: 'Calc. Frete', icon: 'moto' },
          { to: '/motoboys/config', label: 'Configuração', icon: 'config' },
        ],
      },
      {
        label: 'Bonificação', icon: 'trophy', area: 'bonificacao',
        itens: [
          { to: '/rh/bonificacao/mes', label: 'Mês atual', icon: 'calendario' },
          { to: '/rh/bonificacao/equipe', label: 'Equipe & Coins', icon: 'clientes' },
          { to: '/rh/bonificacao/conquistas', label: 'Conquistas', icon: 'avaliacao' },
          { to: '/rh/bonificacao/mercado', label: 'Mercado', icon: 'produtos' },
          { to: '/rh/bonificacao/config', label: 'Configuração', icon: 'gestao' },
        ],
      },
      {
        label: 'Banco de talentos', icon: 'userSearch', area: 'talentos',
        itens: [
          { to: '/rh/banco-de-talentos/banco', label: 'Cadastros', icon: 'clientes' },
          { to: '/rh/banco-de-talentos/vagas', label: 'Vagas abertas', icon: 'ficha' },
          { to: '/rh/banco-de-talentos/formulario', label: 'Formulário permanente', icon: 'ficha' },
        ],
      },
    ],
  },
  {
    label: 'Ferramentas', icon: 'wrench',
    itens: [
      {
        label: 'Checklist', icon: 'clipboardCheck', area: 'checklist',
        itens: [
          { to: '/checklist/painel', label: 'Painel', icon: 'gestao' },
          { to: '/checklist/checklists', label: 'Checklists', icon: 'ficha' },
          { to: '/checklist/templates', label: 'Templates', icon: 'produtos' },
          { to: '/checklist/notificacoes', label: 'Notificações', icon: 'marketing' },
          { to: '/checklist/configuracoes', label: 'Configurações', icon: 'gestao' },
        ],
      },
      {
        label: 'Etiquetas', icon: 'tag', area: 'etiquetas',
        itens: [
          { to: '/etiquetas/config', label: 'Configuração', icon: 'gestao' },
          { to: '/etiquetas/itens', label: 'Itens', icon: 'ficha' },
          { to: '/etiquetas/historico', label: 'Histórico', icon: 'relatorios' },
        ],
      },
    ],
  },
  {
    // Loja Digital: a SUÍTE DE CANAIS que a loja expõe ao cliente por tela. Totem e TV
    // Indoor são produtos distintos aqui em cima; por baixo dividem a mesma infraestrutura
    // de Dispositivo, pareamento e heartbeat. Tudo continua na área `aparelhos`
    // (acessos/areas.js): quem cadastra o tablet é quem audita o que ele mandou ao cardápio.
    label: 'Loja Digital', icon: 'monitorSmartphone',
    itens: [
      {
        // O Totem é um canal com telas de naturezas bem diferentes — auditoria, cadastro de
        // aparelho, apresentação do catálogo, configuração — e por isso é subgrupo.
        //
        // A ORDEM importa mais do que parece: `primeiraFolha` (Visão Geral) e o redirect de
        // `/totem` apontam para a PRIMEIRA folha. Pedidos fica em cima, e trocar isso muda o
        // destino dos dois sem que nada acuse.
        label: 'Totem', icon: 'tablet', area: 'aparelhos',
        itens: [
          { to: '/totem/pedidos', label: 'Pedidos', icon: 'relatorios' },
          { to: '/totem/configuracoes', label: 'Configurações', icon: 'config' },
          { to: '/totem/aparelhos', label: 'Gestão de totens', icon: 'cpu' },
          { to: '/totem/cardapio', label: 'Cardápio', icon: 'ficha' },
          // Nada de abas dentro de página: aba cria um segundo sistema de navegação, e o
          // operador passa a ter de lembrar se o que procura está na sidebar ou lá dentro.
          // O PDV resolve profundidade com subcategoria, e Banners tem DOIS lugares —
          // então ele é subgrupo, e abre os dois no mesmo drill de sempre.
          { to: '/totem/personalizacao', label: 'Personalização', icon: 'star' },
          {
            label: 'Banners', icon: 'marketing',
            itens: [
              { to: '/totem/banners/capa', label: 'Capa' },
              { to: '/totem/banners/espera', label: 'Tela de espera' },
            ],
          },
          { to: '/totem/pagamentos', label: 'Formas de pagamento', icon: 'financeiro' },
        ],
      },
      // Canal irmão, ainda placeholder: sem banco, sem endpoint, sem tela. Megafone porque
      // TV indoor é mídia — e o `monitorSmartphone` já é a marca do grupo inteiro.
      { to: '/tv-indoor', label: 'TV Indoor', icon: 'megaphone', area: 'aparelhos' },
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

// Casa a rota atual e devolve o CAMINHO até ela, para a sidebar abrir no nível certo.
const matchLeaf = (it, pathname) => it.to && (it.to === '/' ? pathname === '/' : pathname === it.to || pathname.startsWith(it.to + '/'));

/* Desce a árvore até achar a folha que casa e devolve os rótulos percorridos. Recursivo
   porque a profundidade é decisão da ÁRVORE, não desta função: enquanto ela sabia contar
   só até dois, acrescentar um nível ao menu exigia mexer aqui e no componente. */
function caminhoAte(nos, pathname, acumulado) {
  for (const n of nos) {
    if (n.itens) {
      const achou = caminhoAte(n.itens, pathname, [...acumulado, n.label]);
      if (achou) return achou;
    } else if (matchLeaf(n, pathname)) {
      return acumulado;
    }
  }
  return null;
}

export function localizarRota(pathname) {
  const caminho = caminhoAte(grupos, pathname, []) ?? [];
  // `grupo` e `sub` continuam saindo daqui: é o que a Visão Geral e os testes já liam, e
  // são só os dois primeiros degraus do mesmo caminho.
  return { caminho, grupo: caminho[0] ?? null, sub: caminho[1] ?? null };
}
