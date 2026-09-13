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
  // Comer na loja: PRATO visto de cima, dois círculos concêntricos.
  //
  // Antes eram garfo e faca soltos. A dupla de talheres é legível, mas a 140px num
  // cartão amarelo ela vira dois riscos verticais desequilibrados — muito traço, pouca
  // forma. O prato é uma silhueta fechada, geométrica, e faz par de verdade com a
  // silhueta fechada da sacola: as duas escolhas passam a ter o mesmo peso visual.
  //
  // Abstrato demais sozinho? Não neste lugar: ele vem com "Vou comer na loja" escrito
  // embaixo, e o par prato/sacola é o vocabulário que qualquer praça de alimentação usa.
  prato: (
    <>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3.2" />
    </>
  ),
  // Cantos arredondados no fundo e a alça um pouco mais alta: mesma família geométrica
  // do prato, em vez do trapézio de cantos vivos de antes.
  sacola: (
    <>
      <path d="M5.6 7.6h12.8l-1.1 12.3a1.7 1.7 0 0 1-1.7 1.5H8.4a1.7 1.7 0 0 1-1.7-1.5L5.6 7.6z" />
      <path d="M9 7.6V5.9a3 3 0 0 1 6 0v1.7" />
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
