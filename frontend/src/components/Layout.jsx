import { Outlet } from 'react-router-dom'
import { useEffect, useState } from 'react'
import Sidebar from './Sidebar'
import Header from './Header'
import { useAuth } from '../contexts/AuthContext'

// Acesso ao NaChapa HUB (igual ao FAB do HUB pro H360). Só para quem não é Cliente.
const HUB_URL = import.meta.env.VITE_HUB_URL || 'https://nachapahub.com.br'

export default function Layout() {
  const { usuario } = useAuth()
  const mostrarHub = usuario && usuario.papel !== 'CLIENTE'
  // Estado de recolher a sidebar vive aqui: o header (botão + card da loja) e a
  // sidebar (largura) compartilham. Body class dirige o CSS de largura/margens.
  const [colapsada, setColapsada] = useState(
    () => typeof localStorage !== 'undefined' && localStorage.getItem('hb-sidebar-collapsed') === '1'
  )
  useEffect(() => {
    document.body.classList.toggle('sidebar-collapsed', colapsada)
    localStorage.setItem('hb-sidebar-collapsed', colapsada ? '1' : '0')
  }, [colapsada])

  return (
    <div className="app-layout">
      <Header colapsada={colapsada} onToggleColapsar={() => setColapsada((c) => !c)} />
      <Sidebar colapsada={colapsada} />
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
