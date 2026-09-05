import { useEffect, useRef, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useTema } from '../hooks/useTema'
import api from '../services/api'

const PAPEL_LABEL = { ADMIN: 'Administrador', AGENCIA: 'Agência', CLIENTE: 'Cliente', GERENTE: 'Gerente' }
const iniciais = (nome) => (nome || '?').trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase() || 'U'
function saudacao() {
  const h = new Date(Date.now() - 3 * 3600 * 1000).getUTCHours() // fuso BR (UTC-3)
  if (h < 5) return 'Boa madrugada'
  if (h < 12) return 'Bom dia'
  if (h < 18) return 'Boa tarde'
  return 'Boa noite'
}

// Ícones de linha (SVG inline)
const svg = (children, size = 19) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
)
const IcoAjuda = svg(<><circle cx="12" cy="12" r="9" /><path d="M9.6 9.5a2.4 2.4 0 1 1 3.4 2.2c-.8.4-1.1.9-1.1 1.8" /><circle cx="12" cy="16.6" r="0.5" /></>)
const IcoSol = svg(<><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>)
const IcoLua = svg(<path d="M21 12.8A8.5 8.5 0 1 1 11.2 3a6.5 6.5 0 0 0 9.8 9.8z" />)
const IcoChevron = svg(<path d="M15 5l-7 7 7 7" />, 18)
// Toggle de tema animado (sol ↔ lua) — CSS puro, a animação vive no global.css.
const IcoTema = (
  <svg className="tema-svg" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
    <mask id="tema-moon-mask">
      <rect x="0" y="0" width="24" height="24" fill="#fff" />
      <circle className="tema-cut" cx="12" cy="12" r="7" fill="#000" />
    </mask>
    <circle className="tema-body" cx="12" cy="12" r="7" fill="currentColor" mask="url(#tema-moon-mask)" />
    <g className="tema-rays" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round">
      <line x1="12" y1="1.5" x2="12" y2="3.8" />
      <line x1="12" y1="20.2" x2="12" y2="22.5" />
      <line x1="1.5" y1="12" x2="3.8" y2="12" />
      <line x1="20.2" y1="12" x2="22.5" y2="12" />
      <line x1="4.4" y1="4.4" x2="6" y2="6" />
      <line x1="18" y1="18" x2="19.6" y2="19.6" />
      <line x1="4.4" y1="19.6" x2="6" y2="18" />
      <line x1="18" y1="6" x2="19.6" y2="4.4" />
    </g>
  </svg>
)

export default function Header({ colapsada, onToggleColapsar }) {
  const { usuario, logout, lojas, empresaAtual } = useAuth()
  const [dark, setDark] = useTema()
  const [menu, setMenu] = useState(false)
  const [frase, setFrase] = useState('')
  const [empresa, setEmpresa] = useState({ nome: 'Hamburgueria', logoDataUrl: null })
  const ref = useRef(null)
  const isAdmin = usuario?.papel === 'ADMIN'
  const primeiro = (usuario?.nome || '').trim().split(/\s+/)[0]

  useEffect(() => {
    api.get('/frases/aleatoria').then((r) => setFrase(r.data?.texto || '')).catch(() => {})
  }, [])

  useEffect(() => {
    let ativo = true
    const aplicar = (d) => setEmpresa({ nome: (d?.nome ?? '').trim() || 'Hamburgueria', logoDataUrl: d?.logoDataUrl ?? null })
    const carregar = () => api.get('/empresa').then((r) => { if (ativo) aplicar(r.data ?? {}) }).catch(() => {})
    carregar()
    const onAtualizada = (e) => (e?.detail ? aplicar(e.detail) : carregar())
    window.addEventListener('empresa-atualizada', onAtualizada)
    return () => { ativo = false; window.removeEventListener('empresa-atualizada', onAtualizada) }
  }, [])

  useEffect(() => {
    function onDoc(e) { if (ref.current && !ref.current.contains(e.target)) setMenu(false) }
    function onEsc(e) { if (e.key === 'Escape') setMenu(false) }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onEsc)
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onEsc) }
  }, [])

  const lojaAtual = lojas.find((l) => String(l.id) === String(empresaAtual))
  const nomeLoja = lojaAtual?.nome || empresa.nome || 'Hamburgueria'
  const avatarInicial = (nomeLoja.trim().charAt(0) || 'H').toUpperCase()

  return (
    <header className="app-header">
      {/* Segmento da loja — alinhado sobre a sidebar (acompanha o recolher). */}
      <div className="app-header-loja">
        {empresa.logoDataUrl ? (
          <img className="app-header-loja-logo" src={empresa.logoDataUrl} alt="" />
        ) : (
          <div className="app-header-loja-logo app-header-loja-inicial">{avatarInicial}</div>
        )}
        <div className="app-header-loja-nome">{nomeLoja}</div>
        <button type="button" className="app-header-colapsar" onClick={onToggleColapsar} title={colapsada ? 'Expandir menu' : 'Recolher menu'} aria-label={colapsada ? 'Expandir menu' : 'Recolher menu'}>
          <span className={colapsada ? 'app-header-colapsar-flip' : ''}>{IcoChevron}</span>
        </button>
      </div>

      <div className="app-header-main">
        <div className="app-header-left">
          {primeiro && <span className="app-header-hello">{saudacao()}, {primeiro}!</span>}
          {frase && <span className="app-header-frase" title={frase}>“{frase}”</span>}
        </div>

        <div className="app-header-right">
          <NavLink to="/central-de-ajuda" className="app-header-btn" title="Central de Ajuda" aria-label="Central de Ajuda">
            {IcoAjuda}
          </NavLink>
          <button type="button" className={'app-header-btn tema-toggle' + (dark ? ' on' : '')} onClick={() => setDark((d) => !d)} title={dark ? 'Tema claro' : 'Tema escuro'} aria-label="Alternar tema">
            {IcoTema}
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
      </div>
    </header>
  )
}
