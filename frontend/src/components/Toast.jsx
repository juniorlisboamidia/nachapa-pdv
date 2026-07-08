import { useEffect } from 'react'

// Toast de feedback pós-ação: pequeno, canto inferior direito, some sozinho.
// type: "success" | "error" | "info"
export default function Toast({ message, type = 'info', onClose }) {
  useEffect(() => {
    if (!message) return undefined
    const timer = setTimeout(() => onClose?.(), 3000)
    return () => clearTimeout(timer)
  }, [message, type, onClose])

  if (!message) return null

  return (
    <div className={`toast toast-${type}`} role="status">
      <span style={{ flex: 1 }}>{message}</span>
      <button
        type="button"
        className="toast-close"
        aria-label="Fechar"
        onClick={() => onClose?.()}
      >
        ×
      </button>
    </div>
  )
}
