import { useCallback, useEffect, useRef, useState } from 'react'

// Nome da categoria na coluna da esquerda.
//
// Dois casos. O comum é caber em uma ou duas linhas, e aí é só texto. O outro é
// o nome que não cabe de jeito nenhum ("COMBOS DO HAMBURGÃO | PRA 1, 2 OU MAIS"):
// cortar com reticências esconde justamente o fim, que costuma ser o que
// diferencia uma categoria da outra. Nesse caso o nome PASSA devagar, indo e
// voltando, com uma pausa em cada ponta para dar tempo de ler.
//
// Três guardas, porque texto que anda sozinho num quiosque é fácil de virar
// ruído: só anda quando REALMENTE não cabe (medido, não presumido), só na
// categoria ATIVA (as outras ficam paradas e cortadas), e nunca com
// `prefers-reduced-motion`.
export default function CategoriaNome({ nome, ativa }) {
  const caixaRef = useRef(null)
  const textoRef = useRef(null)
  const [excedente, setExcedente] = useState(0)

  const medir = useCallback(() => {
    const caixa = caixaRef.current
    const texto = textoRef.current
    if (!caixa || !texto) return
    // Sobra em pixels. Abaixo de 4px é arredondamento de layout, não estouro.
    const sobra = texto.scrollWidth - caixa.clientWidth
    setExcedente(sobra > 4 ? sobra : 0)
  }, [])

  useEffect(() => {
    medir()
    window.addEventListener('resize', medir)
    return () => window.removeEventListener('resize', medir)
  }, [medir, nome])

  const anda = ativa && excedente > 0 && !(typeof window !== 'undefined'
    && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)

  return (
    <span className="tq-cat-nome" ref={caixaRef}>
      <span
        ref={textoRef}
        className={'tq-cat-txt' + (anda ? ' andando' : '')}
        // A duração acompanha a distância: nome pouco maior anda pouco e rápido,
        // nome muito maior anda mais e no mesmo ritmo de leitura (~45px/s).
        style={anda ? { '--tq-anda': `-${excedente}px`, '--tq-anda-dur': `${Math.max(6, (excedente / 45) * 2 + 4)}s` } : undefined}
      >
        {nome}
      </span>
    </span>
  )
}
