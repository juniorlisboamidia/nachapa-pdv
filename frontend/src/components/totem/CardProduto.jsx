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
//
// `fita` é a FAIXA DIAGONAL no canto direito da foto ("Mais pedido", "Novidade"…), a mesma
// fita do Banner do HUB — lá no canto esquerdo, aqui no direito. Chega RESOLVIDA do
// bootstrap (`{ texto, cor }`): o quiosque não conhece códigos nem escolhe cor. Card
// bloqueado não mostra fita: "Mais pedido" em cima de "Em falta" é ruído.
export default function CardProduto({ nome, descricao, imagem, preco, fita, bloqueado, rotuloFalta, aoAbrir }) {
  const temFita = !bloqueado && fita && typeof fita.texto === 'string' && fita.texto.trim() && typeof fita.cor === 'string'
  return (
    <button type="button" className="tq-card" disabled={bloqueado} onClick={aoAbrir}>
      <span className="tq-card-midia">
        <Foto src={imagem} alt="" tamIcone={56} />
        {temFita ? (
          <span className="tq-fita-canto" aria-hidden="true">
            <span className="tq-fita-faixa" style={{ background: fita.cor }}>{fita.texto}</span>
          </span>
        ) : null}
      </span>
      <span className="tq-card-txt">
        <span className="tq-card-nome tq-disp">{nome}</span>
        {descricao ? <span className="tq-card-desc">{descricao}</span> : null}
        <span className="tq-card-rod">
          {bloqueado
            ? <span className="tq-selo">{rotuloFalta}</span>
            : <Preco valor={preco.valor} valorPromocional={preco.valorPromocional} aPartirDe={preco.aPartirDe} oferta />}
        </span>
      </span>
    </button>
  )
}
