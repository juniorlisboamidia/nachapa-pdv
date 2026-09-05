import { useRef, useState } from 'react'

// Copia texto com fallback p/ contexto inseguro (http / navegador de tablet,
// onde navigator.clipboard não existe). Retorna true se copiou.
async function copiarParaArea(texto) {
  try {
    if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(texto); return true }
  } catch { /* cai no fallback abaixo */ }
  try {
    const ta = document.createElement('textarea')
    ta.value = texto
    ta.style.position = 'fixed'; ta.style.top = '-9999px'; ta.style.opacity = '0'
    document.body.appendChild(ta); ta.focus(); ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch { return false }
}

// Botão de copiar com ícone copy ↔ check animado (CSS puro em global.css,
// inspirado no skiper42 — sem framer-motion).
// - texto: string OU função que devolve a string (avaliada no clique).
// - label: texto ao lado do ícone (opcional; vira copiadoLabel no sucesso).
// - className: herda o estilo do contexto (ind-linkfield-copy, esc-link-btn, btn...).
// - onCopiado / onErro: callbacks p/ o toast da página (mensagens específicas).
export default function BotaoCopiar({
  texto, label, copiadoLabel = 'Copiado!', className = 'btn btn-secondary btn-sm',
  title = 'Copiar', onCopiado, onErro, ...rest
}) {
  const [copiado, setCopiado] = useState(false)
  const timer = useRef(null)

  async function handleClick() {
    const valor = typeof texto === 'function' ? texto() : texto
    const ok = await copiarParaArea(valor ?? '')
    if (ok) {
      setCopiado(true)
      onCopiado?.()
      clearTimeout(timer.current)
      timer.current = setTimeout(() => setCopiado(false), 1600)
    } else {
      onErro?.()
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      title={copiado ? copiadoLabel : title}
      aria-label={label || title}
      className={className + ' btn-copiar' + (copiado ? ' copiado' : '')}
      {...rest}
    >
      <span className="btn-copiar-ico" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
          <rect x="9" y="9" width="12" height="12" rx="2.5" />
          <path d="M6 15H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1" />
        </svg>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 6L9 17l-5-5" />
        </svg>
      </span>
      {label != null && <span className="btn-copiar-label">{copiado ? copiadoLabel : label}</span>}
    </button>
  )
}
