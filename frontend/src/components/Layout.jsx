import { Outlet, useLocation } from 'react-router-dom'
import { useEffect, useState } from 'react'
import Sidebar from './Sidebar'
import Header from './Header'

export default function Layout() {
  const location = useLocation()
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
          {/* key por rota: remonta o wrapper a cada navegação e redispara o fade-in */}
          <div key={location.pathname} className="page-fade">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
