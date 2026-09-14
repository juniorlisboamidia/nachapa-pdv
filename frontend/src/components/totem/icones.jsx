// Ícones do quiosque — SVG inline, monocromático, sem biblioteca externa.
// Mesma técnica de components/sidebarIcons.jsx, tamanhos próprios: aqui o desenho
// é lido a um metro de distância, num monitor em pé, então o traço é mais grosso
// (2px) e o tamanho padrão maior.
//
// Por que existe: o quiosque usava emoji como ícone (🍽️ 🛍️ ✅ ⏳ 🌙 ⚠️ 🔌). Emoji
// muda de desenho a cada sistema, não aceita cor da marca e não tem cara de
// produto. Emoji que faz parte do NOME de uma categoria vinda do Cardápio Web
// continua aparecendo — aquilo é dado da loja, não interface (spec §5.4/§9.1).
const ICONES = {
  // ── O PAR DA ESCOLHA DE MODO ──────────────────────────────────────────────────────
  // CASA e SACOLA, os dois desenhados na mesma família do resto do PDV: são os mesmos
  // `house` e `shopping-bag` que `components/sidebarIcons.jsx` já usa no menu do admin,
  // path por path. Um totem e um painel administrativo do mesmo produto não têm por que
  // desenhar uma casa de dois jeitos.
  //
  // Antes eram PRATO (dois círculos concêntricos) e uma sacola própria. O prato era uma
  // abstração que só funcionava porque vinha com a frase embaixo; a casa diz "aqui
  // dentro" sem precisar de legenda, que é o que se quer num alvo visto de um metro.
  casa: (
    <>
      <path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8" />
      <path d="M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </>
  ),
  sacola: (
    <>
      <path d="M16 10a4 4 0 0 1-8 0" />
      <path d="M3.103 6.034h17.794" />
      <path d="M3.4 5.467a2 2 0 0 0-.4 1.2V20a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6.667a2 2 0 0 0-.4-1.2l-2-2.667A2 2 0 0 0 17 2H7a2 2 0 0 0-1.6.8z" />
    </>
  ),
  carrinho: (
    <>
      <circle cx="9" cy="20" r="1.6" />
      <circle cx="18" cy="20" r="1.6" />
      <path d="M2 3h3l2.6 11.4a2 2 0 0 0 2 1.6h7.8a2 2 0 0 0 2-1.6L21 7H6" />
    </>
  ),
  mais: <path d="M12 5v14M5 12h14" />,
  menos: <path d="M5 12h14" />,
  check: <path d="M4 12.5l5.2 5L20 6.5" />,
  lixeira: (
    <>
      <path d="M4 7h16" />
      <path d="M9 7V5h6v2" />
      <path d="M6 7l1 13h10l1-13" />
      <path d="M10 11v6M14 11v6" />
    </>
  ),
  lapis: <path d="M4 20h4L20 8l-4-4L4 16v4z" />,
  // Duas diagonais cheias, canto a canto. Sem círculo em volta: quem faz o alvo e o
  // contorno é o botão, e um círculo desenhado aqui dentro brigaria com ele.
  xis: (
    <>
      <path d="M6 6l12 12" />
      <path d="M18 6L6 18" />
    </>
  ),
  voltar: <path d="M15 19l-7-7 7-7" />,
  relogio: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5.4l3.4 2" />
    </>
  ),
  dinheiro: (
    <>
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <circle cx="12" cy="12" r="2.6" />
      <path d="M6 12h.01M18 12h.01" />
    </>
  ),
  cartao: (
    <>
      <rect x="2" y="5" width="20" height="14" rx="2.5" />
      <path d="M2 10h20M6 15h4" />
    </>
  ),
  alerta: (
    <>
      <path d="M12 3l9.5 17H2.5L12 3z" />
      <path d="M12 9v5M12 17.5v.01" />
    </>
  ),
  semRede: (
    <>
      <path d="M2 4l20 16" />
      <path d="M5 12.5a11 11 0 0 1 4.2-2.4M19 12.5a11 11 0 0 0-6.6-2.9" />
      <path d="M8.5 16a6 6 0 0 1 6.3-.7" />
      <path d="M12 20v.01" />
    </>
  ),
  lua: <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" />,
  pausa: (
    <>
      <rect x="7" y="5" width="3.5" height="14" rx="1.2" />
      <rect x="13.5" y="5" width="3.5" height="14" rx="1.2" />
    </>
  ),
  // Marcador de foto ausente: o cardápio nem sempre tem imagem, e o card não
  // pode desabar nem exibir um quadro vazio sem explicação.
  semFoto: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2.5" />
      <circle cx="8.5" cy="10" r="1.6" />
      <path d="M4 17l4.8-4.4a2 2 0 0 1 2.7 0L20 19" />
    </>
  ),
}

// `tam` em px. `traco` só muda em ícone muito grande, onde 2px fica fino demais.
function Ico({ nome, tam = 28, traco = 2, className }) {
  const desenho = ICONES[nome]
  if (!desenho) return null
  return (
    <svg
      className={'tq-ico' + (className ? ' ' + className : '')}
      width={tam}
      height={tam}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={traco}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {desenho}
    </svg>
  )
}

export { ICONES, Ico }
