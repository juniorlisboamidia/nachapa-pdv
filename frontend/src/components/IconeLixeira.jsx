// Lixeira com a tampa (grupo .ico-trash-lid) que LEVANTA no hover do botão que a
// contém. A animação é global (global.css: .ico-trash-lid / .btn-lixeira),
// inspirada no skiper42 e compartilhada por todas as telas. Use dentro de um
// botão .btn-lixeira (só ícone) para herdar o hover.
export default function IconeLixeira({ size = 15 }) {
  return (
    <svg className="ico-lixeira" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2"
         strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6" />
      <g className="ico-trash-lid">
        <polyline points="3 6 5 6 21 6" />
        <path d="M8 6V4a1 1 0 011-1h4a1 1 0 011 1v2" />
      </g>
    </svg>
  )
}
