import { useState } from 'react'
import { Ico } from './icones'

const LIMITE = 200

// Observação do item (spec §4.3). O RECURSO é o mesmo que já está em produção —
// mesmo limite de 200 caracteres, mesmo valor no estado da linha, mesmo
// `observacao` saindo em `montarCarrinho`, mesmo envio ao HUB e ao Cardápio Web.
// O que muda é só a apresentação: antes um bloco de formulário aberto no fim de
// toda tela de produto; agora uma ação discreta que o cliente abre se quiser.
//
// O texto vive no estado do item aberto, no orquestrador — então ele não se perde
// ao escolher complementos, ao rolar, nem quando o avanço automático muda de
// grupo. O único estado daqui é "o campo está aberto", que é visual e descartável.
export default function BlocoObservacao({ valor, aoMudar }) {
  const texto = valor ?? ''
  // Editar uma linha que já tem observação abre o campo preenchido: esconder o
  // que o cliente escreveu atrás de um botão seria perder a informação de vista.
  const [aberto, setAberto] = useState(texto.length > 0)

  if (!aberto) {
    return (
      <button type="button" className="tq-obs-abrir" onClick={() => setAberto(true)}>
        <Ico nome="lapis" tam={22} /> Adicionar observação
      </button>
    )
  }

  return (
    <div className="tq-obs-bloco">
      <div className="tq-obs-cab">
        <label className="tq-rotulo" htmlFor="tq-observacao">Observação do item · opcional</label>
        <span className="tq-obs-contador tq-num">{texto.length} / {LIMITE}</span>
      </div>
      <textarea
        id="tq-observacao"
        className="tq-obs"
        rows={3}
        maxLength={LIMITE}
        placeholder="Ex.: sem cebola"
        value={texto}
        onChange={(e) => aoMudar(e.target.value)}
      />
    </div>
  )
}
