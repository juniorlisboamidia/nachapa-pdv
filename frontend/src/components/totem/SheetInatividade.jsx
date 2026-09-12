import { Ico } from './icones'

// "Ainda está aí?" — o aviso antes do reset por inatividade.
//
// O totem já voltava ao Início sozinho depois de 90 s parado; o que faltava era
// contar isso a quem está na frente dele. O cliente que só parou para pensar
// perdia o carrinho sem entender por quê.
//
// Duas regras herdadas do relógio de reset, e nenhuma delas é negociável: este
// aviso NÃO aparece enquanto o pedido está sendo enviado nem com a confirmação em
// dúvida. Nesses estados o relógio também não corre, porque zerar a chave de
// idempotência de um pedido que talvez exista é como se cria o segundo.
export default function SheetInatividade({ segundos, aoContinuar }) {
  return (
    <div className="tq-sheet-fundo" role="dialog" aria-modal="true" aria-labelledby="tq-sheet-t">
      <div className="tq-sheet">
        <Ico nome="relogio" tam={44} traco={1.6} />
        <h2 id="tq-sheet-t" className="tq-disp tq-disp-forte">Ainda está aí?</h2>
        <p>
          Sem toque por um tempo, o totem volta ao início e o seu pedido é apagado.
          {' '}Restam <strong className="tq-num">{segundos}</strong> segundos.
        </p>
        <button type="button" className="tq-btn tq-btn-primario tq-btn-largo" onClick={aoContinuar}>
          Continuar meu pedido
        </button>
      </div>
    </div>
  )
}
