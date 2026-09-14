import { useCallback, useEffect, useRef } from 'react'
import { itemOrdenavel, precoDoCard } from '../totemCarrinho'
import { categoriaPorRolagem, marcaNaColuna, progressoNaSecao } from '../totemFoco'
import SidebarCategorias from './SidebarCategorias'
import CardProduto from './CardProduto'

// Catálogo CONTÍNUO: todas as categorias empilhadas num rolar só, como no
// Cardápio Web. Rolando para baixo o cliente entra na próxima categoria sem
// tocar em nada — é assim que ele já lê o cardápio no celular, e uma tela que
// obriga a escolher a categoria antes de ver o produto esconde metade da loja.
//
// A sidebar deixou de FILTRAR e virou índice: ela diz onde o cliente está
// (acompanhando a rolagem) e leva até onde ele quer ir (no toque). Continua
// fixa à esquerda, que é a única diferença combinada em relação ao CW.
//
// Duas regiões roláveis, cada uma com o seu eixo e o seu `overscroll-behavior`;
// nada rola na horizontal.
//
// A VITRINE manda quando o bootstrap a traz. `produtos` pode faltar (servidor
// antigo, ou falha do banco no PDV): aí o grid volta a ser item por item, como
// sempre foi. Nenhum cliente fica sem cardápio por causa de apresentação.
export default function TelaCatalogo({ categorias, categoriaId, aoTrocarCategoria, aoAbrirProduto, aoAbrirItem }) {
  const rolagemRef = useRef(null)
  const ladoRef = useRef(null)
  const secoesRef = useRef(new Map())
  // Quem pediu a última troca. Sem isto o efeito que rola até a categoria
  // responderia ao próprio destaque que a rolagem acabou de produzir, e a tela
  // ficaria puxando o cliente de volta enquanto ele rola.
  const daRolagemRef = useRef(null)
  // Enquanto a rolagem programada corre, o vigia cala: passando por cima de
  // três categorias no caminho, ele acenderia as três.
  const navegandoAteRef = useRef(0)
  const quadroRef = useRef(0)

  // Categoria vazia não vira seção: um título sozinho, sem card nenhum, é pior
  // do que não existir. A sidebar recebe a mesma lista, senão sobraria um
  // atalho que não leva a lugar algum.
  const comConteudo = categorias.filter(
    (c) => (Array.isArray(c?.produtos) ? c.produtos.length : (c?.itens?.length ?? 0)) > 0,
  )

  // Sempre por `getBoundingClientRect`, nunca `offsetTop`: o `offsetParent`
  // aqui é a raiz do quiosque, não o container que rola.
  //
  // O que se mede é o TÍTULO, não o início da seção. O título é o limite que o cliente
  // percebe — enquanto "TRADICIONAIS" está escrito na tela, ele está nos tradicionais —,
  // e o início da seção fica 30px acima dele, o que fazia o destaque trocar fora de hora.
  // A ALTURA do título viaja junto: é ela que define quando ele "chegou" ao topo, e é o
  // que faz a régua acompanhar a escala da tela sem número mágico.
  const medirSecoes = useCallback(() => {
    const cont = rolagemRef.current
    if (!cont) return []
    const base = cont.getBoundingClientRect().top
    const fora = []
    for (const [, el] of secoesRef.current) fora.push(el)
    return fora
      .map((el) => {
        const titulo = el.querySelector('.tq-secao-t') ?? el
        const r = titulo.getBoundingClientRect()
        return { id: el.dataset.cat, topo: r.top - base + cont.scrollTop, alturaTitulo: r.height }
      })
      .sort((a, b) => a.topo - b.topo)
  }, [])

  const aoRolar = useCallback(() => {
    if (quadroRef.current) return
    quadroRef.current = requestAnimationFrame(() => {
      quadroRef.current = 0
      const cont = rolagemRef.current
      if (!cont || Date.now() < navegandoAteRef.current) return
      const secoes = medirSecoes()
      const medida = {
        scrollAtual: cont.scrollTop,
        alturaVisivel: cont.clientHeight,
        alturaTotal: cont.scrollHeight,
      }

      // A categoria PRIMEIRO: o marcador é função dela, e não da rolagem.
      const id = categoriaPorRolagem({ secoes, ...medida })

      // O INDICADOR vai por CSS, não por estado. Marcar estado a cada quadro de rolagem
      // redesenharia noventa cards para mover um risco de 2px — as variáveis são escritas
      // direto no nó da sidebar, que é a única coisa que muda.
      //
      // A pílula é achada pelo `data-cat` do id que ACABOU de ser calculado, e não por
      // `aria-current`: neste quadro o React ainda não repintou a coluna, e o atributo
      // aponta para a categoria anterior.
      const lado = ladoRef.current
      const trilho = lado?.querySelector('.tq-lado-trilho')
      if (lado && trilho && id != null) {
        const pilulas = [...lado.querySelectorAll('.tq-cat')]
        const i = pilulas.findIndex((el) => el.dataset.cat === String(id))
        if (i >= 0) {
          // Tudo por `getBoundingClientRect`: a coluna de categorias também rola, e medir
          // em coordenadas de viewport faz o marcador acompanhar as duas rolagens sem
          // precisar saber que existem duas.
          const base = trilho.getBoundingClientRect()
          const r = pilulas[i].getBoundingClientRect()
          const prox = pilulas[i + 1]?.getBoundingClientRect() ?? null
          const marca = marcaNaColuna({
            inicioPilula: r.top - base.top,
            alturaPilula: r.height,
            inicioProxima: prox ? prox.top - base.top : null,
            alturaTrilha: base.height,
            progresso: progressoNaSecao({ secoes, atual: id, ...medida }),
          })
          lado.style.setProperty('--tq-prog-i', String(marca.inicio))
          lado.style.setProperty('--tq-prog-f', String(marca.fracao))
        }
      }

      if (id == null || String(id) === String(categoriaId)) return
      daRolagemRef.current = String(id)
      aoTrocarCategoria(id)
    })
  }, [medirSecoes, categoriaId, aoTrocarCategoria])

  useEffect(() => {
    const cont = rolagemRef.current
    if (!cont) return undefined
    // O toque do cliente vence a rolagem programada na hora: ele mandou parar.
    const libera = () => { navegandoAteRef.current = 0 }
    cont.addEventListener('scroll', aoRolar, { passive: true })
    cont.addEventListener('touchstart', libera, { passive: true })
    cont.addEventListener('wheel', libera, { passive: true })
    // Uma medição na MONTAGEM. Sem ela o marcador só nasce no primeiro toque, e até lá as
    // variáveis não existem — o CSS cai nos padrões (`0` e `1`) e a trilha aparece dourada
    // de ponta a ponta, dizendo que o cliente está em todo lugar ao mesmo tempo.
    // `aoRolar` agenda um quadro em vez de marcar estado aqui dentro.
    aoRolar()
    return () => {
      cont.removeEventListener('scroll', aoRolar)
      cont.removeEventListener('touchstart', libera)
      cont.removeEventListener('wheel', libera)
      if (quadroRef.current) cancelAnimationFrame(quadroRef.current)
      quadroRef.current = 0
    }
  }, [aoRolar])

  // Toque na sidebar leva até a categoria. Roda também na montagem, e é o que
  // devolve o cliente ao ponto do cardápio em que ele estava quando abriu um
  // produto — sem isto ele voltaria ao topo de uma lista de noventa cards.
  useEffect(() => {
    const alvo = String(categoriaId ?? '')
    if (!alvo) return
    if (daRolagemRef.current === alvo) { daRolagemRef.current = null; return }
    const cont = rolagemRef.current
    const el = secoesRef.current.get(alvo)
    if (!cont || !el) return
    const destino = Math.max(0, el.getBoundingClientRect().top - cont.getBoundingClientRect().top + cont.scrollTop - 8)
    if (Math.abs(destino - cont.scrollTop) < 2) return
    navegandoAteRef.current = Date.now() + 700
    const parado = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
    cont.scrollTo({ top: destino, behavior: parado ? 'auto' : 'smooth' })
  }, [categoriaId])

  if (!comConteudo.length) {
    return (
      <div className="tq-vazio">
        <div className="tq-vazio-t tq-disp tq-disp-forte">Cardápio indisponível</div>
        <p>Nenhum item disponível para pedir no totem agora. Fale com um atendente.</p>
      </div>
    )
  }

  const guardarSecao = (id) => (el) => {
    if (el) secoesRef.current.set(String(id), el)
    else secoesRef.current.delete(String(id))
  }

  return (
    <div className="tq-corpo">
      <SidebarCategorias ref={ladoRef} categorias={comConteudo} categoriaId={categoriaId} aoTrocar={aoTrocarCategoria} />
      <div className="tq-conteudo" ref={rolagemRef}>
        {comConteudo.map((categoria) => (
          <section
            key={categoria.id}
            className="tq-secao"
            data-cat={String(categoria.id)}
            ref={guardarSecao(categoria.id)}
            aria-labelledby={`tq-sec-${categoria.id}`}
          >
            {/* O mesmo nome da sidebar: `nomeExibido` é o apelido que a loja
                deu à categoria, e as duas peças não podem discordar. */}
            <h2 id={`tq-sec-${categoria.id}`} className="tq-secao-t tq-disp tq-disp-forte">
              {categoria.nomeExibido || categoria.nome}
            </h2>
            <div className="tq-grade">
              {Array.isArray(categoria.produtos)
                ? categoria.produtos.map((produto) => {
                  // Duas razões diferentes para o card apagar, e elas não se confundem:
                  // a OPÇÃO em falta (status MISSING) é "Em falta"; o ITEM base
                  // impossível de montar (outro obrigatório sem opção) é
                  // "Indisponível no momento".
                  const emFalta = produto.status && produto.status !== 'ACTIVE'
                  // O preço vem PRONTO do HUB: mínimo da jornada obrigatória e o sinal
                  // de "a partir de". A tela não soma nada — se somasse, o preço
                  // passaria a vir do navegador.
                  const preco = precoDoCard(produto)
                  return (
                    <CardProduto
                      key={`${categoria.id}-${produto.id}`}
                      nome={produto.nome}
                      descricao={produto.descricao}
                      imagem={produto.imagem}
                      preco={preco}
                      selos={produto.selos}
                      bloqueado={!!emFalta || preco.indisponivel}
                      rotuloFalta={!emFalta && produto.motivo === 'GRUPO_EM_FALTA' ? 'Indisponível no momento' : 'Em falta'}
                      aoAbrir={() => aoAbrirProduto(produto)}
                    />
                  )
                })
                : (categoria.itens ?? []).map((item) => {
                  const razao = itemOrdenavel(item)
                  return (
                    <CardProduto
                      key={`${categoria.id}-${item.id}`}
                      nome={item.nome}
                      descricao={item.descricao}
                      imagem={item.imagem}
                      preco={{ valor: item.preco, valorPromocional: item.precoPromocional ?? undefined, aPartirDe: false }}
                      selos={item.selos}
                      bloqueado={!razao.ok}
                      rotuloFalta={razao.motivo === 'GRUPO_EM_FALTA' ? 'Indisponível no momento' : 'Em falta'}
                      aoAbrir={() => aoAbrirItem(item)}
                    />
                  )
                })}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
