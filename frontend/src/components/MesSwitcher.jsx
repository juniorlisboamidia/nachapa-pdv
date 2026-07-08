// Seletor de mês premium (‹ Mês de Ano ›) — compartilhado por Dashboard e Escala.
// Recebe `mes` no formato "AAAA-MM" e chama `onChange(novoMes)`. Setas mudam o
// mês; clicar no rótulo abre o seletor nativo (input invisível por cima).
const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']

function mesAtual() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

const SVG = {
  viewBox: '0 0 24 24', width: 14, height: 14, fill: 'none', stroke: 'currentColor',
  strokeWidth: 1.9, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true
}

export default function MesSwitcher({ mes, onChange }) {
  const atual = mes || mesAtual()
  const [ano, m] = atual.split('-').map(Number)
  function mudar(delta) {
    const d = new Date(Date.UTC(ano, m - 1 + delta, 1))
    onChange(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`)
  }
  return (
    <div className="mes-switcher">
      <button type="button" className="mes-nav" onClick={() => mudar(-1)} aria-label="Mês anterior">
        <svg {...SVG}><path d="m15 18-6-6 6-6" /></svg>
      </button>
      <label className="mes-atual">
        <svg {...SVG}><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>
        <span className="mes-atual-label">{MESES[m - 1] ?? m} de {ano}</span>
        <input
          type="month"
          className="mes-input-hidden"
          value={atual}
          onChange={(e) => onChange(e.target.value || mesAtual())}
          aria-label="Selecionar mês"
        />
      </label>
      <button type="button" className="mes-nav" onClick={() => mudar(1)} aria-label="Próximo mês">
        <svg {...SVG}><path d="m9 18 6-6-6-6" /></svg>
      </button>
    </div>
  )
}
