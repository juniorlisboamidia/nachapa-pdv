// Ícones de linha (SVG inline, monocromáticos) — sem biblioteca externa.
// Compartilhados pela Sidebar e pela Visão Geral (painel de atalhos): a mesma chave de ícone
// da árvore (sidebarNav.js) desenha igual nos dois lugares.
const ICONS = {
  dashboard: (
    <>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V20h14V9.5" />
    </>
  ),
  produtos: (
    <>
      <path d="M21 8 12 3 3 8l9 5 9-5z" />
      <path d="M3 8v8l9 5 9-5V8" />
      <path d="M12 13v8" />
    </>
  ),
  ficha: (
    <>
      <rect x="5" y="4" width="14" height="17" rx="2" />
      <path d="M9 4V3.2A1.2 1.2 0 0 1 10.2 2h3.6A1.2 1.2 0 0 1 15 3.2V4" />
      <path d="M9 10h6M9 13.5h6M9 17h4" />
    </>
  ),
  insumos: <path d="M12 3s6 5.5 6 10a6 6 0 1 1-12 0c0-4.5 6-10 6-10z" />,
  custos: (
    <>
      <rect x="3" y="6" width="18" height="13" rx="2" />
      <path d="M3 10.5h18" />
    </>
  ),
  financeiro: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v10" />
      <path d="M14.6 9.2a2.4 2.4 0 0 0-2.6-1.2c-1.3 0-2.4.8-2.4 1.9s1.1 1.7 2.4 2 2.6.8 2.6 2-1.1 1.9-2.6 1.9a2.5 2.5 0 0 1-2.6-1.3" />
    </>
  ),
  faturamento: (
    <>
      <path d="M4 20h16" />
      <path d="M7 20v-6" />
      <path d="M12 20V5" />
      <path d="M17 20v-9" />
    </>
  ),
  // Scooter de entrega (motoboy): duas rodas, deck e baú traseiro — não é bicicleta.
  moto: (
    <>
      <circle cx="6" cy="17" r="2.6" />
      <circle cx="18" cy="17" r="2.6" />
      <path d="M6 17h6l3-5h2" />
      <path d="M15.4 12l2.6 5" />
      <rect x="3" y="8.5" width="4" height="4.5" rx="0.8" />
      <path d="M7 11h4" />
    </>
  ),
  analise: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 12V4" />
      <path d="M12 12l7 3.2" />
    </>
  ),
  calendario: (
    <>
      <rect x="3.5" y="5" width="17" height="16" rx="2" />
      <path d="M3.5 9.5h17M8 3.5v3M16 3.5v3" />
      <path d="M7.5 13h3M13.5 13h3M7.5 17h3M13.5 17h3" />
    </>
  ),
  entregadores: (
    <>
      <circle cx="9" cy="8" r="3" />
      <path d="M3.5 20a5.5 5.5 0 0 1 11 0" />
      <path d="M16 6.5a3 3 0 0 1 0 5.5" />
      <path d="M17 14.5a5.5 5.5 0 0 1 3.5 5.1" />
    </>
  ),
  empresa: (
    <>
      <rect x="4" y="4" width="7" height="17" rx="1" />
      <rect x="13" y="9" width="7" height="12" rx="1" />
      <path d="M7 8h1M7 12h1M16 13h1M16 17h1" />
    </>
  ),
  ajuda: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.6 9.5a2.4 2.4 0 1 1 3.4 2.2c-.8.4-1.1.9-1.1 1.8" />
      <circle cx="12" cy="16.6" r="0.5" />
    </>
  ),
  sol: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </>
  ),
  lua: <path d="M21 12.8A8.5 8.5 0 1 1 11.2 3a6.5 6.5 0 0 0 9.8 9.8z" />,
  chevron: <path d="M15 5l-7 7 7 7" />,
  chevronRight: <path d="M9 5l7 7-7 7" />,
  caret: <path d="M6 9l6 6 6-6" />,
  gestao: (
    <>
      <rect x="3" y="3" width="7.5" height="7.5" rx="1.5" />
      <rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5" />
      <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5" />
      <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5" />
    </>
  ),
  // Megafone (grupo Marketing)
  marketing: (
    <>
      <path d="M3 10.5v3a1 1 0 0 0 1 1h3l8 4.5v-17L7 9.5H4a1 1 0 0 0-1 1z" />
      <path d="M18 9.5a3 3 0 0 1 0 5" />
    </>
  ),
  // Estrela (Avaliação)
  avaliacao: <path d="M12 3.5l2.6 5.27 5.82.85-4.21 4.1.99 5.79L12 16.77l-5.2 2.74.99-5.79-4.21-4.1 5.82-.85L12 3.5z" />,
  // Pessoa (Clientes)
  clientes: (
    <>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5.5 20a6.5 6.5 0 0 1 13 0" />
    </>
  ),
  // Documento com barras (Relatórios)
  relatorios: (
    <>
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <path d="M9 17v-3M12 17v-5M15 17v-7" />
    </>
  ),
  // Relógio (Ponto Facial)
  ponto: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5V12l3 1.8" />
    </>
  ),
  // Cadeado (área restrita ao ADMIN)
  cadeado: (
    <>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </>
  ),
  config: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z" />
    </>
  ),
}

function Icon({ name, extra }) {
  return (
    <svg
      className={'sidebar-icon' + (extra ? ' ' + extra : '')}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {ICONS[name]}
    </svg>
  )
}

// Ícone de um item: imagem (logo oficial da marca) quando `iconImg`, senão o SVG monocromático.
function ItemIcon({ item }) {
  if (item.iconImg) return <img src={item.iconImg} alt="" className="sidebar-icon" style={{ objectFit: 'contain' }} />
  return <Icon name={item.icon} />
}

export { ICONS, Icon, ItemIcon }
