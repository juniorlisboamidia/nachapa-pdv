import { useEffect, useRef, useState } from 'react'
import { nomeApresentado, imagemApresentada, opcoesVisiveisDaLinha, subtotalLocal } from '../totemCarrinho'
import Foto from './Foto'
import Stepper from './Stepper'
import { moeda } from './formato'
import { Ico } from './icones'

// Uma linha do pedido. O nome, a imagem e os complementos saem das funções de
// apresentação de totemCarrinho — é assim que "X BURGUER" continua se chamando
// X BURGUER da vitrine até o comprovante, sem a linha voltar a se chamar pelo
// nome do item base, e é assim que a opção principal não aparece listada como
// complemento de si mesma.
//
// Remover pede dois toques. Num quiosque não existe desfazer nem histórico: o
// item some e o cliente monta tudo de novo. A confirmação fica na própria linha,
// expira sozinha em 4 s e não rouba a tela com um modal.
export default function LinhaCarrinho({ linha, aoEditar, aoRemover, aoMudarQtd }) {
  const [confirmando, setConfirmando] = useState(false)
  const timerRef = useRef(null)

  useEffect(() => () => clearTimeout(timerRef.current), [])

  function tocarRemover() {
    if (confirmando) { clearTimeout(timerRef.current); aoRemover(); return }
    setConfirmando(true)
    timerRef.current = setTimeout(() => setConfirmando(false), 4_000)
  }

  const nome = nomeApresentado(linha)
  const opcoes = opcoesVisiveisDaLinha(linha)

  return (
    <div className="tq-linha">
      <Foto src={imagemApresentada(linha)} alt="" className="tq-linha-foto" tamIcone={30} />
      <div className="tq-linha-corpo">
        <div className="tq-linha-nome tq-disp">{linha.qtd}× {nome}</div>
        {opcoes.length ? (
          <ul className="tq-linha-ops">
            {opcoes.map((o) => (
              <li key={`${o.grupoId}-${o.opcaoId}`}>{o.qtd > 1 ? `${o.qtd}× ` : ''}{o.nome}</li>
            ))}
          </ul>
        ) : null}
        {linha.observacao ? <div className="tq-linha-obs">“{linha.observacao}”</div> : null}
      </div>
      <div className="tq-linha-lado">
        <div className="tq-linha-valor tq-disp tq-disp-forte tq-num">{moeda(subtotalLocal(linha))}</div>
        <Stepper
          valor={linha.qtd}
          rotulo={`Quantidade de ${nome}`}
          aoMenos={() => aoMudarQtd(-1)}
          aoMais={() => aoMudarQtd(1)}
        />
        <div className="tq-linha-acoes">
          <button type="button" className="tq-mini" onClick={aoEditar}>
            <Ico nome="lapis" tam={18} /> Editar
          </button>
          <button
            type="button"
            className={'tq-mini perigo' + (confirmando ? ' confirmando' : '')}
            onClick={tocarRemover}
          >
            <Ico nome="lixeira" tam={18} /> {confirmando ? 'Confirmar' : 'Remover'}
          </button>
        </div>
      </div>
    </div>
  )
}
