import { useCallback, useEffect, useRef, useState } from 'react'
import CategoriaNome from './CategoriaNome'

// Categorias fixas à esquerda. É o espelho de `catalogo.categorias` do bootstrap,
// na ordem do `index` do Cardápio Web — nada é reordenado, agrupado nem inventado
// aqui. Categoria real da loja aparece como ela é, inclusive quando o nome traz
// emoji (🥇 OS MAIS PEDIDOS): aquilo é dado do cardápio, não ícone de interface.
//
// Sem ícone e sem miniatura na V1 (spec §9.1): o CW não fornece imagem de
// categoria, e adivinhar uma a partir do primeiro produto engana mais do que ajuda.
//
// O NOME, porém, a loja controla: `nomeExibido` vem de Totem › Apresentação e é
// o que resolve o emoji cadastrado para o cardápio digital, que aqui só rouba
// caractere de uma coluna estreita.
export default function SidebarCategorias({ categorias, categoriaId, aoTrocar }) {
  const rolagemRef = useRef(null)
  const ativoRef = useRef(null)
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

  // Com o catálogo contínuo, quem troca a categoria destacada é a ROLAGEM da
  // grade, não o dedo do cliente nesta coluna: passando de dez categorias, a
  // destacada pode estar fora de vista. Só rola quando está — e pelo container,
  // nunca por `scrollIntoView`, que arrastaria a casca inteira junto.
  useEffect(() => {
    const cont = rolagemRef.current
    const el = ativoRef.current
    if (!cont || !el) return
    const base = cont.getBoundingClientRect()
    const r = el.getBoundingClientRect()
    if (r.top >= base.top - 1 && r.bottom <= base.bottom + 1) return
    const parado = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
    cont.scrollTo({ top: Math.max(0, r.top - base.top + cont.scrollTop - 12), behavior: parado ? 'auto' : 'smooth' })
  }, [categoriaId])

  return (
    <nav className="tq-lado" aria-label="Categorias">
      <div className="tq-lado-rolagem" ref={rolagemRef}>
        {categorias.map((c) => {
          const ativa = String(c.id) === String(categoriaId)
          return (
          <button
            key={c.id}
            type="button"
            className="tq-cat"
            ref={ativa ? ativoRef : null}
            aria-current={ativa ? 'true' : undefined}
            onClick={() => aoTrocar(c.id)}
          >
            {/* `nomeExibido` é o apelido que a loja deu à categoria no admin;
                sem ele vale o nome do Cardápio Web, como sempre valeu. */}
            <CategoriaNome nome={c.nomeExibido || c.nome} ativa={ativa} />
          </button>
          )
        })}
      </div>
      {temMais ? <div className="tq-lado-fade" aria-hidden="true" /> : null}
    </nav>
  )
}
