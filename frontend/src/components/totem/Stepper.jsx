import { Ico } from './icones'

// Contador de quantidade. Dois alvos de 56px com folga entre eles: no vidro, com
// uma mão, "+" e "−" colados viram erro de toque.
export default function Stepper({ valor, aoMenos, aoMais, minimo = 1, maximoAtingido, rotulo }) {
  return (
    <div className="tq-stepper" role="group" aria-label={rotulo}>
      <button type="button" className="tq-step" onClick={aoMenos} disabled={valor <= minimo} aria-label="Diminuir">
        <Ico nome="menos" tam={24} traco={2.4} />
      </button>
      <span className="tq-step-v tq-disp tq-disp-forte tq-num" aria-live="polite">{valor}</span>
      <button type="button" className="tq-step" onClick={aoMais} disabled={!!maximoAtingido} aria-label="Aumentar">
        <Ico nome="mais" tam={24} traco={2.4} />
      </button>
    </div>
  )
}
