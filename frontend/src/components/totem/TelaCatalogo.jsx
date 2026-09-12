import { useEffect, useRef } from 'react'
import { itemOrdenavel, precoDoCard } from '../totemCarrinho'
import SidebarCategorias from './SidebarCategorias'
import CardProduto from './CardProduto'

// Catálogo: categorias fixas à esquerda, produtos em duas colunas à direita.
// Duas regiões roláveis, cada uma com o seu eixo e o seu `overscroll-behavior`;
// nada rola na horizontal.
//
// A VITRINE manda quando o bootstrap a traz. `produtos` pode faltar (servidor
// antigo, ou falha do banco no PDV): aí o grid volta a ser item por item, como
// sempre foi. Nenhum cliente fica sem cardápio por causa de apresentação.
export default function TelaCatalogo({ categorias, categoria, categoriaId, aoTrocarCategoria, aoAbrirProduto, aoAbrirItem }) {
  const rolagemRef = useRef(null)

  // Trocar de categoria começa a leitura do topo. Sem isto o cliente cai no meio
  // da lista nova, na altura em que estava na anterior.
  useEffect(() => {
    if (rolagemRef.current) rolagemRef.current.scrollTop = 0
  }, [categoriaId])

  if (!categorias.length) {
    return (
      <div className="tq-vazio">
        <div className="tq-vazio-t tq-disp tq-disp-forte">Cardápio indisponível</div>
        <p>Nenhum item disponível para pedir no totem agora. Fale com um atendente.</p>
      </div>
    )
  }

  const temVitrine = Array.isArray(categoria?.produtos)

  return (
    <div className="tq-corpo">
      <SidebarCategorias categorias={categorias} categoriaId={categoria?.id} aoTrocar={aoTrocarCategoria} />
      <div className="tq-conteudo" ref={rolagemRef}>
        <div className="tq-grade">
          {temVitrine
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
                  bloqueado={!!emFalta || preco.indisponivel}
                  rotuloFalta={!emFalta && produto.motivo === 'GRUPO_EM_FALTA' ? 'Indisponível no momento' : 'Em falta'}
                  aoAbrir={() => aoAbrirProduto(produto)}
                />
              )
            })
            : (categoria?.itens ?? []).map((item) => {
              const razao = itemOrdenavel(item)
              return (
                <CardProduto
                  key={`${categoria.id}-${item.id}`}
                  nome={item.nome}
                  descricao={item.descricao}
                  imagem={item.imagem}
                  preco={{ valor: item.preco, valorPromocional: item.precoPromocional ?? undefined, aPartirDe: false }}
                  bloqueado={!razao.ok}
                  rotuloFalta={razao.motivo === 'GRUPO_EM_FALTA' ? 'Indisponível no momento' : 'Em falta'}
                  aoAbrir={() => aoAbrirItem(item)}
                />
              )
            })}
        </div>
      </div>
    </div>
  )
}
