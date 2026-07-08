// Diálogo de confirmação no padrão visual do sistema (substitui window.confirm).
// variant: "danger" | "default"
export default function ConfirmDialog({
  open,
  title,
  message,
  description,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  variant = 'default',
  loading = false,
  onConfirm,
  onCancel
}) {
  if (!open) return null

  return (
    <div className="confirm-overlay">
      <div className="confirm-dialog" role="alertdialog" aria-modal="true">
        {title && <div className="confirm-title">{title}</div>}
        {message && <div className="confirm-message">{message}</div>}
        {description && <div className="confirm-description">{description}</div>}
        <div className="confirm-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onCancel}
            disabled={loading}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={'btn ' + (variant === 'danger' ? 'btn-danger' : 'btn-primary')}
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? 'Aguarde…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
