import { forwardRef, useCallback, useEffect, useRef, useState } from 'react'
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
// `forwardRef` porque o nó da coluna é onde o catálogo escreve as variáveis do indicador
// de posição — e ele as escreve a cada quadro de rolagem, sem passar por estado.
const SidebarCategorias = forwardRef(function SidebarCategorias({ categorias, categoriaId, aoTrocar }, ladoRef) {
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
    <nav className="tq-lado" aria-label="Categorias" ref={ladoRef}>
      <div className="tq-lado-rolagem" ref={rolagemRef}>
        {categorias.map((c) => {
          const ativa = String(c.id) === String(categoriaId)
          return (
          <button
            key={c.id}
            type="button"
            className="tq-cat"
            // O catálogo acha a pílula por aqui para posicionar o marcador. Não dá para
            // usar `aria-current`: no quadro em que a categoria muda o React ainda não
            // repintou, e a busca traria a pílula ANTERIOR — o marcador ficaria um passo
            // atrás justamente no momento em que ele precisa acertar.
            data-cat={c.id}
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

      {/* ONDE O CLIENTE ESTÁ NO CATÁLOGO.
          O marcador tem a altura de uma pílula e pousa sobre a categoria atual, deslizando
          para a próxima conforme a seção avança. Ele já foi uma barra de rolagem, calculada
          pela fração rolada do catálogo, e o problema não era de ajuste: barra de rolagem e
          destaque de categoria medem coisas diferentes, e com categorias de tamanhos
          diferentes elas não podem concordar — a tela mostrava dois indicadores apontando
          para lugares distantes um do outro.
          `aria-hidden` porque é reforço visual: quem usa leitor de tela já tem o
          `aria-current` dizendo em que categoria está. */}
      <div className="tq-lado-trilho" aria-hidden="true"><span className="tq-lado-polegar" /></div>
    </nav>
  )
})

export default SidebarCategorias
