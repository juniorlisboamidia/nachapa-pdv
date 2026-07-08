import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import { useAuth } from '../contexts/AuthContext'

// Acesso ao NaChapa HUB (igual ao FAB do HUB pro H360). Só para quem não é Cliente.
const HUB_URL = import.meta.env.VITE_HUB_URL || 'https://nachapahub.com.br'

export default function Layout() {
  const { usuario } = useAuth()
  const mostrarHub = usuario && usuario.papel !== 'CLIENTE'
  return (
    <div className="app-layout">
      <Sidebar />
      <div className="main-area">
        <main className="page-content">
          <Outlet />
        </main>
      </div>
      {mostrarHub && (
        <a
          className="fab-hub"
          href={HUB_URL}
          target="_blank"
          rel="noopener noreferrer"
          title="Abrir NaChapa HUB"
          aria-label="Abrir NaChapa HUB"
        >
          <span className="fab-hub-label">NaChapa HUB</span>
          <img src="/fab-hub.png" alt="" />
        </a>
      )}
    </div>
  )
}
