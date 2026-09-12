import { useCallback, useEffect, useRef, useState } from 'react'

// Categorias fixas à esquerda. É o espelho de `catalogo.categorias` do bootstrap,
// na ordem do `index` do Cardápio Web — nada é reordenado, agrupado nem inventado
// aqui. Categoria real da loja aparece como ela é, inclusive quando o nome traz
// emoji (🥇 OS MAIS PEDIDOS): aquilo é dado do cardápio, não ícone de interface.
//
// Sem ícone e sem miniatura na V1 (spec §9.1): o CW não fornece imagem de
// categoria, e adivinhar uma a partir do primeiro produto engana mais do que ajuda.
export default function SidebarCategorias({ categorias, categoriaId, aoTrocar }) {
  const rolagemRef = useRef(null)
  const [temMais, setTemMais] = useState(false)

  // O tablet não desenha barra de rolagem, então a única pista de que a lista
  // continua é este esmaecido no rodapé — calculado, não presumido.
  const medir = useCallback(() => {
    const el = rolagemRef.current
    if (!el) { setTemMais(false); return }
    setTemMais(el.scrollHeight - el.clientHeight - el.scrollTop > 8)
  }, [])

  useEffect(() => {
    medir()
    const el = rolagemRef.current
    if (!el) return undefined
    el.addEventListener('scroll', medir, { passive: true })
    window.addEventListener('resize', medir)
    return () => { el.removeEventListener('scroll', medir); window.removeEventListener('resize', medir) }
  }, [medir, categorias])

  return (
    <nav className="tq-lado" aria-label="Categorias">
      <div className="tq-lado-rolagem" ref={rolagemRef}>
        {categorias.map((c) => (
          <button
            key={c.id}
            type="button"
            className="tq-cat"
            aria-current={String(c.id) === String(categoriaId) ? 'true' : undefined}
            onClick={() => aoTrocar(c.id)}
          >
            {c.nome}
          </button>
        ))}
      </div>
      {temMais ? <div className="tq-lado-fade" aria-hidden="true" /> : null}
    </nav>
  )
}
