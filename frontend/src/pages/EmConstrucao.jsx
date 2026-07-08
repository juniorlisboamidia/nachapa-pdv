// Placeholder reutilizável para áreas ainda não construídas (ex.: Marketing).
// Mantém o cabeçalho padrão para a navegação funcionar enquanto o conteúdo
// real não é definido.
export default function EmConstrucao({ titulo, descricao }) {
  return (
    <div>
      <div className="page-header">
        <div>
          <h1>{titulo}</h1>
          {descricao && <div className="page-header-sub">{descricao}</div>}
        </div>
      </div>
      <div className="card">
        <div className="empty-state" style={{ padding: '56px 20px' }}>
          Em construção — esta área será preparada em breve.
        </div>
      </div>
    </div>
  )
}
