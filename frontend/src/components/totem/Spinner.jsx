// Indicador de espera. `claro` para quando o fundo é o preto da marca.
export default function Spinner({ claro }) {
  return <span className={'tq-spinner' + (claro ? ' claro' : '')} aria-hidden="true" />
}
