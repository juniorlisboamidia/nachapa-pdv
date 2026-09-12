import { Ico } from './icones'

// Tela cheia de recado: loja fechada, pedidos pausados, catálogo fora do ar,
// pedido recusado. Fundo preto e uma frase — quem lê isto está de pé, na frente
// do totem, e precisa saber em dois segundos se espera ou se procura o balcão.
//
// Sem emoji: o ícone é o mesmo conjunto SVG do resto da tela.
export default function TelaAviso({ icone = 'alerta', titulo, texto, lista, acoes }) {
  return (
    <div className="tq-tela-aviso">
      <div className="tq-tela-aviso-ico" aria-hidden="true">
        <Ico nome={icone} tam={62} traco={1.6} />
      </div>
      <h1 className="tq-disp tq-disp-forte">{titulo}</h1>
      {texto ? <p>{texto}</p> : null}
      {lista}
      {acoes ? <div className="tq-acoes-aviso">{acoes}</div> : null}
    </div>
  )
}
