import Foto from './Foto'
import Preco from './Preco'

// Um card, dois mundos. O grid pode estar desenhando um PRODUTO da vitrine
// (X BURGUER, que por baixo é uma opção do grupo principal de TRADICIONAIS 🍔)
// ou um ITEM técnico do cardápio, quando o bootstrap não trouxe `produtos`.
// Para o cliente não existe diferença, e por isso o desenho é o mesmo componente:
// quem resolve a origem é quem chama.
//
// A foto é o elemento maior do card de propósito — comida vende por foto, e o
// card antigo dava 132px a ela num monitor de 1920.
export default function CardProduto({ nome, descricao, imagem, preco, bloqueado, rotuloFalta, aoAbrir }) {
  return (
    <button type="button" className="tq-card" disabled={bloqueado} onClick={aoAbrir}>
      <Foto src={imagem} alt="" tamIcone={56} />
      <span className="tq-card-txt">
        <span className="tq-card-nome tq-disp">{nome}</span>
        {descricao ? <span className="tq-card-desc">{descricao}</span> : null}
        <span className="tq-card-rod">
          {bloqueado
            ? <span className="tq-selo">{rotuloFalta}</span>
            : <Preco valor={preco.valor} valorPromocional={preco.valorPromocional} aPartirDe={preco.aPartirDe} />}
        </span>
      </span>
    </button>
  )
}
