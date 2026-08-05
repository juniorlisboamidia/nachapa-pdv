import { useEffect, useRef, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useTema } from '../hooks/useTema'

const PAPEL_LABEL = { ADMIN: 'Administrador', AGENCIA: 'Agência', CLIENTE: 'Cliente', GERENTE: 'Gerente' }
const iniciais = (nome) => (nome || '?').trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase() || 'U'

// Ícones de linha (SVG inline)
const svg = (children) => (
  <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
)
const IcoAjuda = svg(<><circle cx="12" cy="12" r="9" /><path d="M9.6 9.5a2.4 2.4 0 1 1 3.4 2.2c-.8.4-1.1.9-1.1 1.8" /><circle cx="12" cy="16.6" r="0.5" /></>)
const IcoSol = svg(<><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>)
const IcoLua = svg(<path d="M21 12.8A8.5 8.5 0 1 1 11.2 3a6.5 6.5 0 0 0 9.8 9.8z" />)

export default function Header() {
  const { usuario, logout } = useAuth()
  const [dark, setDark] = useTema()
  const [menu, setMenu] = useState(false)
  const ref = useRef(null)
  const isAdmin = usuario?.papel === 'ADMIN'

  useEffect(() => {
    function onDoc(e) { if (ref.current && !ref.current.contains(e.target)) setMenu(false) }
    function onEsc(e) { if (e.key === 'Escape') setMenu(false) }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onEsc)
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onEsc) }
  }, [])

  return (
    <header className="app-header">
      <div className="app-header-right">
        <NavLink to="/central-de-ajuda" className="app-header-btn" title="Central de Ajuda" aria-label="Central de Ajuda">
          {IcoAjuda}
        </NavLink>
        <button type="button" className="app-header-btn" onClick={() => setDark((d) => !d)} title={dark ? 'Tema claro' : 'Tema escuro'} aria-label="Alternar tema">
          {dark ? IcoLua : IcoSol}
        </button>
        <div className="app-header-user" ref={ref}>
          <button type="button" className="app-header-avatar-btn" onClick={() => setMenu((m) => !m)} aria-haspopup="menu" aria-expanded={menu} title="Sua conta">
            <span className="app-header-avatar">{iniciais(usuario?.nome)}</span>
          </button>
          {menu && (
            <div className="app-header-menu" role="menu">
              <div className="app-header-menu-head">
                <div className="app-header-menu-name">{usuario?.nome || 'Usuário'}</div>
                <div className="app-header-menu-sub">{PAPEL_LABEL[usuario?.papel] || 'Conta'}</div>
              </div>
              {isAdmin && <NavLink to="/minha-empresa" className="app-header-menu-item" onClick={() => setMenu(false)}>Minha Empresa</NavLink>}
              {isAdmin && <NavLink to="/frases" className="app-header-menu-item" onClick={() => setMenu(false)}>Frases motivacionais</NavLink>}
              <button type="button" className="app-header-menu-item danger" onClick={() => { setMenu(false); logout() }}>Sair</button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
